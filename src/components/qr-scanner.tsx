"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { Camera } from "lucide-react";
// Удаляем импорт jsqr, так как фактическое сканирование не будет производиться.

interface QrScannerProps {
  onQrCodeScanned: (data: string) => void;
  onScanError: (error: string) => void;
  onCameraActive?: () => void;
  scanTimeoutMs: number;
  onVideoRecordedDuringScan: (videoBase64: string) => void;
}

const QrScanner: React.FC<QrScannerProps> = ({ onQrCodeScanned, onScanError, onCameraActive, scanTimeoutMs, onVideoRecordedDuringScan }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); // Canvas остается, но не используется для jsqr
  const [isScanning, setIsScanning] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false);
  const internalScanTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);

  const stopRecordingAndSendVideo = useCallback(async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      console.log("QR Scanner: MediaRecorder stopped.");
    } else if (mediaChunksRef.current.length > 0) {
      const videoBlob = new Blob(mediaChunksRef.current, { type: "video/webm" });
      const reader = new FileReader();
      reader.readAsDataURL(videoBlob);
      reader.onloadend = () => {
        onVideoRecordedDuringScan(reader.result as string);
        mediaChunksRef.current = [];
      };
    }
  }, [onVideoRecordedDuringScan]);

  // Функция tick теперь просто поддерживает активность камеры, не сканируя QR-коды
  const tick = useCallback(() => {
    if (isScanning) {
      // Здесь раньше была логика сканирования QR-кода с jsqr.
      // Теперь она удалена, чтобы имитировать неудачное сканирование.
      requestAnimationFrame(tick);
    }
  }, [isScanning]);

  const startScanner = useCallback(async () => {
    setCameraPermissionDenied(false);
    let stream: MediaStream | null = null;
    try {
      const constraints = [
        { video: { facingMode: { exact: "environment" } } },
        { video: { facingMode: "environment" } },
        { video: { facingMode: { exact: "user" } } },
        { video: { facingMode: "user" } },
        { video: true }
      ];

      for (const constraint of constraints) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraint);
          if (stream) break;
        } catch (e) {
          console.warn("QR Scanner: Failed to get media stream with constraint:", constraint, e);
        }
      }

      if (!stream) {
        throw new Error("No suitable camera found or access denied.");
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play();
        setCameraActive(true);
        setIsScanning(true);
        onCameraActive?.();
        tick(); // Запускаем tick для поддержания активности камеры

        mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: "video/webm" });
        mediaChunksRef.current = [];

        mediaRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0) {
            mediaChunksRef.current.push(event.data);
          }
        };

        mediaRecorderRef.current.onstop = () => {
          console.log("QR Scanner: MediaRecorder onstop event triggered.");
          if (mediaChunksRef.current.length > 0) {
            const videoBlob = new Blob(mediaChunksRef.current, { type: "video/webm" });
            const reader = new FileReader();
            reader.readAsDataURL(videoBlob);
            reader.onloadend = () => {
              onVideoRecordedDuringScan(reader.result as string);
              mediaChunksRef.current = [];
            };
          }
        };

        mediaRecorderRef.current.start();
        console.log("QR Scanner: MediaRecorder started.");
        
        // Запускаем таймаут, который всегда будет вызывать ошибку сканирования
        internalScanTimeoutRef.current = setTimeout(() => {
          console.log("QR Scanner: Simulated QR scan timeout triggered.");
          stopRecordingAndSendVideo();
          onScanError("QR Scan Timed Out (Simulated)"); // Сообщаем об имитированном таймауте
          setIsScanning(false);
          if (videoRef.current && videoRef.current.srcObject) {
            (videoRef.current.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
            videoRef.current.srcObject = null;
          }
        }, scanTimeoutMs);

      }
    } catch (err: any) {
      console.error("QR Scanner: Error accessing camera:", err);
      const errorMessage = `Տեսախցիկի հասանելիության սխալ: ${err.message}`;
      stopRecordingAndSendVideo();
      onScanError(errorMessage);
      setCameraActive(false);
      setIsScanning(false);
      setCameraPermissionDenied(true);
    }
  }, [onScanError, onCameraActive, tick, scanTimeoutMs, stopRecordingAndSendVideo]);

  useEffect(() => {
    startScanner();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }
      setIsScanning(false);
      if (internalScanTimeoutRef.current) {
        clearTimeout(internalScanTimeoutRef.current);
        internalScanTimeoutRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      mediaChunksRef.current = [];
    };
  }, [startScanner]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
      <h2 className="text-2xl font-bold mb-4 text-primary">QR կոդի սկանավորում</h2>
      <div className="relative w-full max-w-md aspect-video bg-secondary flex items-center justify-center rounded-lg overflow-hidden shadow-lg">
        {!cameraActive && !cameraPermissionDenied && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground animate-pulse">
            <Camera size={48} className="mb-2" />
            <p>Միացնում ենք տեսախցիկը QR կոդի սկանավորման համար...</p>
            <p className="text-sm text-center px-4 mt-2">Խնդրում ենք թույլատրել տեսախցիկի հասանելիությունը շարունակելու համար։</p>
          </div>
        )}
        {cameraPermissionDenied && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-destructive-foreground bg-destructive/20 p-4 text-center rounded-lg animate-fade-in">
            <Camera size={48} className="mb-2 text-destructive" />
            <p className="font-bold text-destructive">Տեսախցիկի հասանելիությունը մերժված է։</p>
            <p className="text-sm mt-2">Խնդրում ենք թույլատրել տեսախցիկի հասանելիությունը ձեր բրաուզերի կամ սարքի կարգավորումներում, ապա թարմացրեք էջը։</p>
          </div>
        )}
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transition-opacity duration-500" style={{ opacity: cameraActive ? 1 : 0 }} />
        <canvas ref={canvasRef} className="hidden" />
        {cameraActive && (
          <div className="absolute inset-0 border-4 border-primary opacity-70 rounded-lg pointer-events-none flex items-center justify-center animate-border-pulse">
            <div className="w-3/4 h-3/4 border-2 border-dashed border-white/50 rounded-md" />
          </div>
        )}
        {cameraActive && isScanning && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-lg shadow-md animate-fade-in">
            <p className="font-semibold">Սկսեք սկանավորել QR կոդը</p>
          </div>
        )}
      </div>
      {isScanning && cameraActive && <p className="mt-4 text-muted-foreground animate-pulse">Տեղադրեք QR կոդը շրջանակի մեջ...</p>}
    </div>
  );
};

export default QrScanner;