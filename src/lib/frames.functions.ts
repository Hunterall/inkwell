import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth } from "@/integrations/firebase/auth-middleware";

// Server function: verifies auth, calls AI image API, returns the base64 image URL.
// The client is responsible for persisting it to Firestore.
export const generateFrameImage = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator(
    (input: { frameId: string; heading: string; description: string; style: string }) => input,
  )
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured.");
    const prompt = `Cinematic storyboard frame, ${data.style || "moody film still"}. Scene: ${data.heading}. ${data.description}. Wide 3:2 composition, film lighting, no text, no captions, no watermarks.`;
    const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-image-2.5-sunburst",
        prompt,
        size: "1536x1024",
        quality: "medium",
        output_format: "jpeg",
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
