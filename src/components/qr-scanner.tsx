"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import jsQR from "jsqr";
// import { toast } from "sonner"; // Удаляем импорт toast
import { Camera } from "lucide-react"; // Using Lucide icon for visual feedback

interface QrScannerProps {
  onQrCodeScanned: (data: string) => void;
  onScanError: (error: string) => void;
}

const QrScanner: React.FC<QrScannerProps> = ({ onQrCodeScanned, onScanError }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);

  const startScanner = useCallback(async () => {
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
        tick(); // Start scanning frames
      }
    } catch (err: any) {
      console.error("Error accessing back camera:", err);
      onScanError(`Failed to access back camera: ${err.message}`); // onScanError callback remains for internal logic
      setCameraActive(false);
      setIsScanning(false);
    }
  }, [onScanError]);

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
          // toast.success("QR Code scanned!"); // Удаляем тост
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
      <h2 className="text-2xl font-bold mb-4">Scan QR Code</h2>
      <div className="relative w-full max-w-md aspect-video bg-muted flex items-center justify-center rounded-lg overflow-hidden">
        {!cameraActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
            <Camera size={48} className="mb-2" />
            <p>Accessing camera...</p>
            <p className="text-sm text-center px-4">Please grant camera permissions to scan QR codes.</p>
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
      {isScanning && cameraActive && <p className="mt-4 text-muted-foreground">Scanning for QR code...</p>}
    </div>
  );
};

export default QrScanner;