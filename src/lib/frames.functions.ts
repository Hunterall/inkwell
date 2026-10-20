import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth } from "@/integrations/firebase/auth-middleware";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/integrations/firebase/client";

// Server function: verifies auth, generates a storyboard frame image using the
// user's OpenRouter API key (the same key configured for text AI in Settings),
// and returns the base64 image URL. The client persists it to Firestore.
// Falls back to the server LOVABLE_API_KEY env var if no user key is stored.
export const generateFrameImage = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator(
    (input: { frameId: string; heading: string; description: string; style: string }) => input,
  )
  .handler(async ({ data, context }) => {
    // Resolve API key: prefer the user's OpenRouter key from Settings, then env fallback.
    let apiKey = process.env["LOVABLE_API_KEY"] ?? "";
    try {
      const snap = await getDoc(doc(db, "user_settings", context.userId));
      if (snap.exists()) {
        const settings = snap.data() as { openRouterApiKey?: string } | undefined;
        if (settings?.openRouterApiKey?.trim()) {
          apiKey = settings.openRouterApiKey.trim();
        }
      }
    } catch {
      /* ignore read errors; fall back to env var below */
    }
    if (!apiKey) throw new Error("AI is not configured. Add your OpenRouter API key in Settings.");

    const prompt = `Cinematic storyboard frame, ${data.style || "moody film still"}. Scene: ${data.heading}. ${data.description}. Wide 3:2 composition, film lighting, no text, no captions, no watermarks.`;

    const res = await fetch("https://openrouter.ai/api/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/dall-e-3",
        prompt,
        size: "1792x1024",
        response_format: "b64_json",
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      let msg = `Image generation failed (${res.status})`;
      try {
        const j = JSON.parse(text);
        msg = j?.error?.message ?? j?.message ?? msg;
      } catch {
        /* keep default */
      }
      if (res.status === 402)
        msg = "You're out of AI credits. Add credits in your workspace to keep generating images.";
      throw new Error(msg);
    }
    const json = (await res.json()) as { data?: { b64_json?: string }[] };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new Error("No image was returned");
    return { image_url: `data:image/jpeg;base64,${b64}` };
  });
