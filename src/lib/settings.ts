import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/integrations/firebase/client";

export type AiSettings = {
  openRouterApiKey: string;
  openRouterModel: string;
  /** Image generation settings — Gemini, Pollinations AI, Cloudflare AI */
  imageGeminiApiKey: string;
  imageGeminiModel: string;
  imagePollinationsApiKey: string;
  imagePollinationsModel: string;
  imageCloudflareAccountId: string;
  imageCloudflareApiToken: string;
  imageCloudflareModel: string;
  /** Which image provider to use */
  imageProvider: "gemini" | "pollinations" | "cloudflare";
};

export const POPULAR_GEMINI_IMAGE_MODELS = [
  { id: "imagen-3.0-generate-002", name: "Imagen 3 (Recommended)" },
  { id: "gemini-2.5-flash-image", name: "Gemini 2.5 Flash Image" },
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
];

export const POPULAR_POLLINATIONS_MODELS = [
  { id: "flux", name: "FLUX.1 Schnell (Default, Fast & High Quality)" },
  { id: "flux-realism", name: "FLUX Realism" },
  { id: "flux-anime", name: "FLUX Anime / Stylized" },
  { id: "flux-3d", name: "FLUX 3D" },
  { id: "turbo", name: "SDXL Turbo" },
];

export const POPULAR_CLOUDFLARE_MODELS = [
  { id: "@cf/black-forest-labs/flux-1-schnell", name: "FLUX.1 Schnell (Recommended)" },
  { id: "@cf/stabilityai/stable-diffusion-xl-base-1.0", name: "Stable Diffusion XL Base 1.0" },
  { id: "@cf/bytedance/stable-diffusion-xl-lightning", name: "SDXL Lightning (Fast)" },
  { id: "@cf/lykon/dreamshaper-8-lcm", name: "DreamShaper 8 LCM" },
];

export const POPULAR_MODELS = [
  {
    id: "anthropic/claude-3.5-sonnet",
    name: "Claude 3.5 Sonnet",
    tag: "Recommended for Prose",
    description: "Exceptional literary tone, nuanced character dialogue, and vivid prose.",
  },
  {
    id: "anthropic/claude-3.7-sonnet",
    name: "Claude 3.7 Sonnet",
    tag: "Cutting Edge",
    description: "Hybrid reasoning and literary excellence for complex plotting and deep narratives.",
  },
  {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    tag: "Fast & Creative",
    description: "Flagship versatile OpenAI model, excellent at structure and screenplay formatting.",
  },
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    tag: "Fast & Economical",
    description: "Very fast and budget-conscious for rapid brainstorming and outlines.",
  },
  {
    id: "deepseek/deepseek-chat",
    name: "DeepSeek V3",
    tag: "Great Value",
    description: "Remarkably strong writing quality at an unbeatable price point.",
  },
  {
    id: "deepseek/deepseek-r1",
    name: "DeepSeek R1",
    tag: "Reasoning",
    description: "Deep thinking model best for resolving intricate plot twists and mysteries.",
  },
  {
    id: "google/gemini-2.0-flash-001",
    name: "Gemini 2.0 Flash",
    tag: "Blazing Fast",
    description: "Instant speed with large context window for expansive story bibles.",
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    name: "Llama 3.3 70B",
    tag: "Open Source",
    description: "High performance open model with high quality creative output.",
  },
];

export const DEFAULT_AI_SETTINGS: AiSettings = {
  openRouterApiKey: "",
  openRouterModel: "anthropic/claude-3.5-sonnet",
  imageGeminiApiKey: "",
  imageGeminiModel: "imagen-3.0-generate-002",
  imagePollinationsApiKey: "",
  imagePollinationsModel: "flux",
  imageCloudflareAccountId: "",
  imageCloudflareApiToken: "",
  imageCloudflareModel: "@cf/black-forest-labs/flux-1-schnell",
  imageProvider: "pollinations",
};

const LOCAL_STORAGE_KEY = "inkwell_ai_settings_v1";

/**
 * Reads settings synchronously from localStorage (with fallbacks)
 */
export function getAiSettings(): AiSettings {
  if (typeof window === "undefined") return DEFAULT_AI_SETTINGS;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return DEFAULT_AI_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AiSettings>;
    return {
      openRouterApiKey: parsed.openRouterApiKey?.trim() ?? "",
      openRouterModel: parsed.openRouterModel?.trim() || DEFAULT_AI_SETTINGS.openRouterModel,
      imageGeminiApiKey: parsed.imageGeminiApiKey?.trim() ?? "",
      imageGeminiModel: parsed.imageGeminiModel?.trim() || DEFAULT_AI_SETTINGS.imageGeminiModel,
      imagePollinationsApiKey: parsed.imagePollinationsApiKey?.trim() ?? "",
      imagePollinationsModel: parsed.imagePollinationsModel?.trim() || DEFAULT_AI_SETTINGS.imagePollinationsModel,
      imageCloudflareAccountId: parsed.imageCloudflareAccountId?.trim() ?? "",
      imageCloudflareApiToken: parsed.imageCloudflareApiToken?.trim() ?? "",
      imageCloudflareModel: parsed.imageCloudflareModel?.trim() || DEFAULT_AI_SETTINGS.imageCloudflareModel,
      imageProvider:
        parsed.imageProvider === "gemini" ||
        parsed.imageProvider === "pollinations" ||
        parsed.imageProvider === "cloudflare"
          ? parsed.imageProvider
          : DEFAULT_AI_SETTINGS.imageProvider,
    };
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

/**
 * Saves settings to localStorage and optionally to Firestore for the user
 */
export async function saveAiSettings(
  settings: Partial<AiSettings>,
  userId?: string,
): Promise<AiSettings> {
  const current = getAiSettings();
  const updated: AiSettings = {
    openRouterApiKey:
      settings.openRouterApiKey !== undefined
        ? settings.openRouterApiKey.trim()
        : current.openRouterApiKey,
    openRouterModel:
      settings.openRouterModel !== undefined
        ? settings.openRouterModel.trim()
        : current.openRouterModel,
    imageGeminiApiKey:
      settings.imageGeminiApiKey !== undefined
        ? settings.imageGeminiApiKey.trim()
        : current.imageGeminiApiKey,
    imageGeminiModel:
      settings.imageGeminiModel !== undefined
        ? settings.imageGeminiModel.trim()
        : current.imageGeminiModel,
    imagePollinationsApiKey:
      settings.imagePollinationsApiKey !== undefined
        ? settings.imagePollinationsApiKey.trim()
        : current.imagePollinationsApiKey,
    imagePollinationsModel:
      settings.imagePollinationsModel !== undefined
        ? settings.imagePollinationsModel.trim()
        : current.imagePollinationsModel,
    imageCloudflareAccountId:
      settings.imageCloudflareAccountId !== undefined
        ? settings.imageCloudflareAccountId.trim()
        : current.imageCloudflareAccountId,
    imageCloudflareApiToken:
      settings.imageCloudflareApiToken !== undefined
        ? settings.imageCloudflareApiToken.trim()
        : current.imageCloudflareApiToken,
    imageCloudflareModel:
      settings.imageCloudflareModel !== undefined
        ? settings.imageCloudflareModel.trim()
        : current.imageCloudflareModel,
    imageProvider: settings.imageProvider ?? current.imageProvider,
  };

  if (typeof window !== "undefined") {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  }

  if (userId) {
    try {
      await setDoc(
        doc(db, "user_settings", userId),
        {
          ...updated,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } catch (e) {
      console.warn("Could not persist settings to Firestore:", e);
    }
  }

  return updated;
}

/**
 * Loads settings from Firestore for the given user, caching them to localStorage
 */
export async function loadAiSettings(userId: string): Promise<AiSettings> {
  const local = getAiSettings();
  if (!userId) return local;

  try {
    const snap = await getDoc(doc(db, "user_settings", userId));
    if (snap.exists()) {
      const data = snap.data() as Partial<AiSettings>;
      const merged: AiSettings = {
        openRouterApiKey: data.openRouterApiKey?.trim() || local.openRouterApiKey || "",
        openRouterModel:
          data.openRouterModel?.trim() || local.openRouterModel || DEFAULT_AI_SETTINGS.openRouterModel,
        imageGeminiApiKey: data.imageGeminiApiKey?.trim() || local.imageGeminiApiKey || "",
        imageGeminiModel:
          data.imageGeminiModel?.trim() || local.imageGeminiModel || DEFAULT_AI_SETTINGS.imageGeminiModel,
        imagePollinationsApiKey:
          data.imagePollinationsApiKey?.trim() || local.imagePollinationsApiKey || "",
        imagePollinationsModel:
          data.imagePollinationsModel?.trim() || local.imagePollinationsModel || DEFAULT_AI_SETTINGS.imagePollinationsModel,
        imageCloudflareAccountId:
          data.imageCloudflareAccountId?.trim() || local.imageCloudflareAccountId || "",
        imageCloudflareApiToken:
          data.imageCloudflareApiToken?.trim() || local.imageCloudflareApiToken || "",
        imageCloudflareModel:
          data.imageCloudflareModel?.trim() || local.imageCloudflareModel || DEFAULT_AI_SETTINGS.imageCloudflareModel,
        imageProvider:
          data.imageProvider === "gemini" ||
          data.imageProvider === "pollinations" ||
          data.imageProvider === "cloudflare"
            ? data.imageProvider
            : local.imageProvider,
      };
      if (typeof window !== "undefined") {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
      }
      return merged;
    }
  } catch (e) {
    console.warn("Could not load settings from Firestore:", e);
  }

  return local;
}

/**
 * Verifies an OpenRouter API key using OpenRouter's auth endpoint
 */
export async function verifyOpenRouterKey(apiKey: string): Promise<{
  valid: boolean;
  label?: string | undefined;
  usage?: number | undefined;
  limit?: number | null | undefined;
  isFreeTier?: boolean | undefined;
  error?: string | undefined;
}> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    return { valid: false, error: "Please enter an API key." };
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers: {
        Authorization: `Bearer ${cleanKey}`,
      },
    });

    if (!res.ok) {
      let errorMsg = `Invalid API key (HTTP ${res.status})`;
      try {
        const j = await res.json();
        errorMsg = j?.error?.message || errorMsg;
      } catch {
        /* ignore */
      }
      return { valid: false, error: errorMsg };
    }

    const json = (await res.json()) as {
      data?: {
        label?: string;
        usage?: number;
        limit?: number | null;
        is_free_tier?: boolean;
      };
    };

    return {
      valid: true,
      label: json.data?.label,
      usage: json.data?.usage,
      limit: json.data?.limit,
      isFreeTier: json.data?.is_free_tier,
    };
  } catch (e) {
    return {
      valid: false,
      error: (e as Error).message || "Failed to connect to OpenRouter.",
    };
  }
}
