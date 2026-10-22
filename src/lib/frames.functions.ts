import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth } from "@/integrations/firebase/auth-middleware";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/integrations/firebase/client";
import { DEFAULT_AI_SETTINGS, type AiSettings } from "@/lib/settings";

type ImageProvider = "gemini" | "pollinations" | "cloudflare";

interface ImageGenConfig {
  frameId: string;
  heading: string;
  description: string;
  style: string;
  provider?: ImageProvider;
}

function envKeyFor(provider: ImageProvider): string {
  switch (provider) {
    case "gemini":
      return (
        process.env["IMAGE_GEMINI_API_KEY"] ||
        process.env["GEMINI_API_KEY"] ||
        ""
      ).trim();
    case "pollinations":
      return (
        process.env["IMAGE_POLLINATIONS_API_KEY"] ||
        process.env["POLLINATIONS_API_KEY"] ||
        ""
      ).trim();
    case "cloudflare":
      return (
        process.env["CLOUDFLARE_API_TOKEN"] ||
        process.env["IMAGE_CLOUDFLARE_API_TOKEN"] ||
        ""
      ).trim();
  }
}

async function loadUserAiSettings(userId: string): Promise<AiSettings> {
  try {
    const snap = await getDoc(doc(db, "user_settings", userId));
    if (snap.exists()) {
      return { ...DEFAULT_AI_SETTINGS, ...(snap.data() as Partial<AiSettings>) };
    }
  } catch {
    /* ignore read errors; fall back to defaults */
  }
  return DEFAULT_AI_SETTINGS;
}

export const generateFrameImage = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((input: ImageGenConfig) => input)
  .handler(async ({ data, context }) => {
    const userSettings = await loadUserAiSettings(context.userId);
    const provider = data.provider ?? userSettings.imageProvider ?? "pollinations";

    const prompt = `Cinematic storyboard frame, ${data.style || "moody film still"}. Scene: ${data.heading}. ${data.description}. Wide 16:9 composition, film lighting, no text, no captions, no watermarks.`;

    let imageUrl = "";

    if (provider === "pollinations") {
      // Pollinations AI URL Generator (Fast, flexible, works with optional API key)
      const model = userSettings.imagePollinationsModel?.trim() || "flux";
      const apiKey = (
        userSettings.imagePollinationsApiKey?.trim() ||
        envKeyFor("pollinations")
      ).trim();

      const encodedPrompt = encodeURIComponent(prompt);
      const params = new URLSearchParams({
        model,
        width: "1280",
        height: "720",
        nologo: "true",
        enhance: "false",
        seed: Math.floor(Math.random() * 1000000).toString(),
      });

      if (apiKey) {
        params.append("key", apiKey);
      }

      const pollinationUrl = `https://gen.pollinations.ai/image/${encodedPrompt}?${params.toString()}`;

      // Fetch with headers to verify generation succeeded and convert to base64 or verified URL
      const headers: Record<string, string> = {};
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const res = await fetch(pollinationUrl, { method: "GET", headers });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Pollinations AI generation failed (${res.status}): ${errText.slice(0, 200)}`);
      }

      const contentType = res.headers.get("content-type") || "image/jpeg";
      const arrayBuffer = await res.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      imageUrl = `data:${contentType};base64,${base64}`;
    } else if (provider === "gemini") {
      // Google Gemini / Imagen 3 API key
      const apiKey = (
        userSettings.imageGeminiApiKey?.trim() ||
        envKeyFor("gemini")
      ).trim();

      if (!apiKey) {
        throw new Error(
          "No Gemini API key configured. Please enter your Gemini API key in Settings under Image Generation.",
        );
      }

      const geminiModel =
        userSettings.imageGeminiModel?.trim() || "imagen-3.0-generate-002";

      // If Imagen model is selected
      if (geminiModel.startsWith("imagen-")) {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:predict?key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instances: [{ prompt }],
            parameters: {
              sampleCount: 1,
              aspectRatio: "16:9",
              outputMimeType: "image/jpeg",
            },
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          let msg = `Gemini Imagen failed (${res.status})`;
          try {
            const j = JSON.parse(errText);
            msg = j?.error?.message || msg;
          } catch {
            /* ignore */
          }
          throw new Error(msg);
        }

        const json = (await res.json()) as any;
        const b64 = json.predictions?.[0]?.bytesBase64Encoded;
        const mime = json.predictions?.[0]?.mimeType || "image/jpeg";
        if (!b64) throw new Error("Gemini Imagen did not return any image data");
        imageUrl = `data:${mime};base64,${b64}`;
      } else {
        // Native multimodal Gemini image model (e.g. gemini-2.5-flash-image)
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseModalities: ["IMAGE"],
            },
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          let msg = `Gemini failed (${res.status})`;
          try {
            const j = JSON.parse(errText);
            msg = j?.error?.message || msg;
          } catch {
            /* ignore */
          }
          throw new Error(msg);
        }

        const json = (await res.json()) as any;
        const parts = json.candidates?.[0]?.content?.parts || [];
        const inlinePart = parts.find((p: any) => p.inlineData?.data);
        if (!inlinePart) {
          throw new Error("Gemini did not return an image. Try selecting the Imagen 3 model in Settings.");
        }
        imageUrl = `data:${inlinePart.inlineData.mimeType || "image/jpeg"};base64,${inlinePart.inlineData.data}`;
      }
    } else if (provider === "cloudflare") {
      // Cloudflare Workers AI Image Generation
      const accountId = (
        userSettings.imageCloudflareAccountId?.trim() ||
        process.env["CLOUDFLARE_ACCOUNT_ID"] ||
        ""
      ).trim();
      const apiToken = (
        userSettings.imageCloudflareApiToken?.trim() ||
        envKeyFor("cloudflare")
      ).trim();

      if (!accountId) {
        throw new Error(
          "Cloudflare Account ID is required. Add it in Settings under Image Generation.",
        );
      }
      if (!apiToken) {
        throw new Error(
          "Cloudflare API Token is required. Add it in Settings under Image Generation.",
        );
      }

      const cfModel =
        userSettings.imageCloudflareModel?.trim() ||
        "@cf/black-forest-labs/flux-1-schnell";

      const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${cfModel}`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) {
        const errText = await res.text();
        let msg = `Cloudflare AI generation failed (${res.status})`;
        try {
          const j = JSON.parse(errText);
          msg = j?.errors?.[0]?.message || j?.messages?.[0] || msg;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }

      const contentType = res.headers.get("content-type") || "image/png";

      // If returned as raw binary image
      if (contentType.startsWith("image/")) {
        const arrayBuffer = await res.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        imageUrl = `data:${contentType};base64,${base64}`;
      } else {
        // Might be JSON containing base64 string
        const json = (await res.json()) as any;
        const b64 = json.result?.image || json.result?.image_base64 || json.image;
        if (!b64) throw new Error("Cloudflare did not return an image");
        imageUrl = b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`;
      }
    }

    if (!imageUrl) {
      throw new Error("No image was produced by the selected provider.");
    }

    return { image_url: imageUrl };
  });
