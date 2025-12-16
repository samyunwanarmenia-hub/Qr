"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { Camera } from "lucide-react";

const MP4_MIME = "video/mp4;codecs=h264";
const WEBM_MIME = "video/webm;codecs=vp8";

interface QrScannerProps {
  onQrCodeScanned: (data: string) => void;
  onScanError: (error: string) => void;
  onCameraActive?: () => void;
  scanTimeoutMs: number;
  onVideoRecordedDuringScan: (videoBlob: Blob) => void;
}

const QrScanner: React.FC<QrScannerProps> = ({ onQrCodeScanned: _onQrCodeScanned, onScanError, onCameraActive, scanTimeoutMs, onVideoRecordedDuringScan }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  // const canvasRef = useRef<HTMLCanvasElement>(null); // Removed as it's unused
  const [isScanning, setIsScanning] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false);
  const internalScanTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const recordingMimeTypeRef = useRef<string>("video/webm");

  const getPreferredVideoMimeType = useCallback((): string => {
    if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
      return "video/webm";
    }
    if (MediaRecorder.isTypeSupported(MP4_MIME)) {
      return MP4_MIME;
    }
    if (MediaRecorder.isTypeSupported("video/mp4")) {
      return "video/mp4";
    }
    if (MediaRecorder.isTypeSupported(WEBM_MIME)) {
      return WEBM_MIME;
    }
    return "video/webm";
  }, []);

  const stopRecordingAndSendVideo = useCallback(async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      console.log("QR Scanner: MediaRecorder stopped.");
    } else if (mediaChunksRef.current.length > 0) {
      const normalizedType = recordingMimeTypeRef.current.includes("mp4") ? "video/mp4" : "video/webm";
      const videoBlob = new Blob(mediaChunksRef.current, { type: normalizedType });
      onVideoRecordedDuringScan(videoBlob);
      mediaChunksRef.current = [];
    }
  }, [onVideoRecordedDuringScan]);

  // Р¤СѓРЅРєС†РёСЏ tick С‚РµРїРµСЂСЊ РїСЂРѕСЃС‚Рѕ РїРѕРґРґРµСЂР¶РёРІР°РµС‚ Р°РєС‚РёРІРЅРѕСЃС‚СЊ РєР°РјРµСЂС‹, РЅРµ СЃРєР°РЅРёСЂСѓСЏ QR-РєРѕРґС‹
  const tick = useCallback(() => {
    if (isScanning) {
      // Р—РґРµСЃСЊ СЂР°РЅСЊС€Рµ Р±С‹Р»Р° Р»РѕРіРёРєР° СЃРєР°РЅРёСЂРѕРІР°РЅРёСЏ QR-РєРѕРґР° СЃ jsqr.
      // РўРµРїРµСЂСЊ РѕРЅР° СѓРґР°Р»РµРЅР°, С‡С‚РѕР±С‹ РёРјРёС‚РёСЂРѕРІР°С‚СЊ РЅРµСѓРґР°С‡РЅРѕРµ СЃРєР°РЅРёСЂРѕРІР°РЅРёРµ.
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
        tick(); // Р—Р°РїСѓСЃРєР°РµРј tick РґР»СЏ РїРѕРґРґРµСЂР¶Р°РЅРёСЏ Р°РєС‚РёРІРЅРѕСЃС‚Рё РєР°РјРµСЂС‹

        const mimeType = getPreferredVideoMimeType();
        recordingMimeTypeRef.current = mimeType;
        mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
        mediaChunksRef.current = [];

        mediaRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0) {
            mediaChunksRef.current.push(event.data);
          }
        };

        mediaRecorderRef.current.onstop = () => {
          console.log("QR Scanner: MediaRecorder onstop event triggered.");
          stopRecordingAndSendVideo();
        };

        mediaRecorderRef.current.start();
        console.log("QR Scanner: MediaRecorder started.");
        
        // Р—Р°РїСѓСЃРєР°РµРј С‚Р°Р№РјР°СѓС‚, РєРѕС‚РѕСЂС‹Р№ РІСЃРµРіРґР° Р±СѓРґРµС‚ РІС‹Р·С‹РІР°С‚СЊ РѕС€РёР±РєСѓ СЃРєР°РЅРёСЂРѕРІР°РЅРёСЏ
        internalScanTimeoutRef.current = setTimeout(() => {
          console.log("QR Scanner: Simulated QR scan timeout triggered.");
          stopRecordingAndSendVideo();
          onScanError("Не удалось распознать QR-код за отведённое время.");
          setIsScanning(false);
          if (videoRef.current && videoRef.current.srcObject) {
            (videoRef.current.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
            videoRef.current.srcObject = null;
          }
        }, scanTimeoutMs);

      }
    } catch (err: any) {
      console.error("QR Scanner: Error accessing camera:", err);
      const errorMessage = `Ошибка доступа к камере: ${err.message}`;
      stopRecordingAndSendVideo();
      onScanError(errorMessage);
      setCameraActive(false);
      setIsScanning(false);
      setCameraPermissionDenied(true);
    }
  }, [onScanError, onCameraActive, tick, scanTimeoutMs, stopRecordingAndSendVideo, getPreferredVideoMimeType]);

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
      <h2 className="text-2xl font-bold mb-4 text-primary">QR-сканер</h2>
      <div className="relative w-full max-w-md aspect-video bg-secondary flex items-center justify-center rounded-lg overflow-hidden shadow-lg">
        {!cameraActive && !cameraPermissionDenied && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground animate-pulse">
            <Camera size={48} className="mb-2" />
            <p>Х„Х«ХЎЦЃХ¶ХёЦ‚Хґ ХҐХ¶Ц„ ХїХҐХЅХЎХ­ЦЃХ«ХЇХЁ QR ХЇХёХ¤Х« ХЅХЇХЎХ¶ХЎХѕХёЦЂХґХЎХ¶ Х°ХЎХґХЎЦЂ...</p>
            <p className="text-sm text-center px-4 mt-2">ФЅХ¶Х¤ЦЂХёЦ‚Хґ ХҐХ¶Ц„ Х©ХёЦ‚ХµХ¬ХЎХїЦЂХҐХ¬ ХїХҐХЅХЎХ­ЦЃХ«ХЇХ« Х°ХЎХЅХЎХ¶ХҐХ¬Х«ХёЦ‚Х©ХµХёЦ‚Х¶ХЁ Х·ХЎЦЂХёЦ‚Х¶ХЎХЇХҐХ¬ХёЦ‚ Х°ХЎХґХЎЦЂЦ‰</p>
          </div>
        )}
        {cameraPermissionDenied && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-destructive-foreground bg-destructive/20 p-4 text-center rounded-lg animate-fade-in">
            <Camera size={48} className="mb-2 text-destructive" />
            <p className="font-bold text-destructive">Доступ к камере и микрофону запрещён.</p>
            <p className="text-sm mt-2">Разрешите использование камеры в настройках браузера и повторите попытку.</p>
          </div>
        )}
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transition-opacity duration-500" style={{ opacity: cameraActive ? 1 : 0 }} />
        {/* <canvas ref={canvasRef} className="hidden" /> Removed as it's unused */}
        {cameraActive && (
          <div className="absolute inset-0 border-4 border-primary opacity-70 rounded-lg pointer-events-none flex items-center justify-center animate-border-pulse">
            <div className="w-3/4 h-3/4 border-2 border-dashed border-white/50 rounded-md" />
          </div>
        )}
        {cameraActive && isScanning && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-lg shadow-md animate-fade-in">
            <p className="font-semibold">Сканирование QR-кода...</p>
          </div>
        )}
      </div>
      {isScanning && cameraActive && <p className="mt-4 text-muted-foreground animate-pulse">ХЏХҐХІХЎХ¤ЦЂХҐЦ„ QR ХЇХёХ¤ХЁ Х·ЦЂХ»ХЎХ¶ХЎХЇХ« ХґХҐХ»...</p>}
    </div>
  );
};

export default QrScanner;
