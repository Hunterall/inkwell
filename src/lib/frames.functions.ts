import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth } from "@/integrations/firebase/auth-middleware";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/integrations/firebase/client";
import { DEFAULT_AI_SETTINGS, type AiSettings } from "@/lib/settings";

type ImageProvider = "pollinations" | "cloudflare";

interface ImageGenConfig {
  frameId: string;
  heading: string;
  description: string;
  style: string;
  provider?: ImageProvider;
}

function envKeyFor(provider: ImageProvider): string {
  switch (provider) {
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

function sanitizeSecrets(raw: unknown, secrets: (string | undefined | null)[]): string {
  const msg =
    raw instanceof Error
      ? raw.message
      : typeof raw === "string"
        ? raw
        : "Image generation failed";
  let clean = msg;
  for (const s of secrets) {
    if (s && s.length > 4) {
      clean = clean.replaceAll(s, "[REDACTED]");
    }
  }
  clean = clean.replace(/Bearer\s+[A-Za-z0-9_\-.]+/gi, "Bearer [REDACTED]");
  return clean;
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
        // Strict Privacy Controls:
        // nofeed=true: Prevents generated frames and prompt text from appearing on public feed
        // private=true: Prevents public indexing and community gallery recording
        nofeed: "true",
        private: "true",
        seed: Math.floor(Math.random() * 1000000).toString(),
      });

      const pollinationUrl = `https://gen.pollinations.ai/image/${encodedPrompt}?${params.toString()}`;

      // Authentication passed exclusively via secure HTTP headers (never leaked in URL query string)
      const headers: Record<string, string> = {};
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      try {
        const res = await fetch(pollinationUrl, { method: "GET", headers });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Pollinations AI generation failed (${res.status}): ${errText.slice(0, 200)}`);
        }

        const contentType = res.headers.get("content-type") || "image/jpeg";
        const arrayBuffer = await res.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        imageUrl = `data:${contentType};base64,${base64}`;
      } catch (err) {
        throw new Error(sanitizeSecrets(err, [apiKey]));
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

      try {
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
      } catch (err) {
        throw new Error(sanitizeSecrets(err, [apiToken, accountId]));
      }
    }

    if (!imageUrl) {
      throw new Error("No image was produced by the selected provider.");
    }

    return { image_url: imageUrl };
  });
