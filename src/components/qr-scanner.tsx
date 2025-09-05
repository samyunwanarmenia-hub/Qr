"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import jsQR from "jsqr";
import { Camera } from "lucide-react";
import { toast } from "sonner"; // Импорт toast

interface QrScannerProps {
  onQrCodeScanned: (data: string) => void;
  onScanError: (error: string) => void;
  onCameraActive?: () => void; // New callback for when camera is successfully active
}

const QrScanner: React.FC<QrScannerProps> = ({ onQrCodeScanned, onScanError, onCameraActive }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false); // New state for permission denial

  const startScanner = useCallback(async () => {
    setCameraPermissionDenied(false); // Reset on new attempt
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: "environment" } }, // Request back camera
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true"); // Required for iOS
        await videoRef.current.play();
        setCameraActive(true);
        setIsScanning(true);
        onCameraActive?.(); // Notify parent that camera is active
        tick(); // Start scanning frames
      }
    } catch (err: any) {
      console.error("Error accessing back camera:", err);
      const errorMessage = `Не удалось получить доступ к задней камере: ${err.message}`;
      toast.error(errorMessage); // Уведомление Sonner
      onScanError(errorMessage);
      setCameraActive(false);
      setIsScanning(false);
      setCameraPermissionDenied(true); // Set permission denied state
    }
  }, [onScanError, onCameraActive]);

  const tick = useCallback(() => {
    if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      if (ctx) {
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });

        if (code) {
          console.log("QR Code detected:", code.data);
          onQrCodeScanned(code.data);
          setIsScanning(false); // Stop scanning after finding one
          if (video.srcObject) {
            (video.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
          }
          return; // Stop the loop
        }
      }
    }

    if (isScanning) {
      requestAnimationFrame(tick); // Continue scanning
    }
  }, [isScanning, onQrCodeScanned]);

  useEffect(() => {
    startScanner();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
      }
      setIsScanning(false);
    };
  }, [startScanner]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
      <h2 className="text-2xl font-bold mb-4">Сканирование QR-кода</h2>
      <div className="relative w-full max-w-md aspect-video bg-muted flex items-center justify-center rounded-lg overflow-hidden">
        {!cameraActive && !cameraPermissionDenied && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
            <Camera size={48} className="mb-2" />
            <p>Ожидание доступа к камере...</p>
            <p className="text-sm text-center px-4">Пожалуйста, предоставьте разрешение на использование камеры для сканирования QR-кодов.</p>
          </div>
        )}
        {cameraPermissionDenied && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-destructive-foreground bg-destructive/20 p-4 text-center">
            <Camera size={48} className="mb-2 text-destructive" />
            <p className="font-bold text-destructive">Доступ к камере отклонен!</p>
            <p className="text-sm mt-2">Пожалуйста, разрешите доступ к камере в настройках вашего браузера или устройства, затем обновите страницу.</p>
          </div>
        )}
        <video ref={videoRef} className="w-full h-full object-cover" style={{ display: cameraActive ? 'block' : 'none' }} />
        <canvas ref={canvasRef} className="hidden" /> {/* Canvas is hidden, used for processing */}
        {cameraActive && (
          <div className="absolute inset-0 border-4 border-primary-foreground opacity-70 rounded-lg pointer-events-none flex items-center justify-center">
            <div className="w-3/4 h-3/4 border-2 border-dashed border-white/50 rounded-md" />
          </div>
        )}
      </div>
      {isScanning && cameraActive && <p className="mt-4 text-muted-foreground">Идет сканирование QR-кода...</p>}
    </div>
  );
};

export default QrScanner;