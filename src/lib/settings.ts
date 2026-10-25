import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/integrations/firebase/client";

export type AiSettings = {
  /** Text provider (OpenRouter) */
  textProvider: "openrouter";
  openRouterApiKey: string;
  openRouterModel: string;
  /** Image generation settings — Pollinations AI, Cloudflare AI */
  imagePollinationsApiKey: string;
  imagePollinationsModel: string;
  imageCloudflareAccountId: string;
  imageCloudflareApiToken: string;
  imageCloudflareModel: string;
  /** Which image provider to use */
  imageProvider: "pollinations" | "cloudflare";
};

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

export type OpenRouterModelInfo = {
  id: string;
  name: string;
  tag: string;
  category: "free" | "flagship";
  isFree: boolean;
  contextLength: string;
  description: string;
};

export const POPULAR_MODELS: OpenRouterModelInfo[] = [
  // ── 100% FREE MODELS ($0 / TOKEN) ──
  {
    id: "openrouter/free",
    name: "Free Models Router",
    tag: "100% Free • Auto-Fallback",
    category: "free",
    isFree: true,
    contextLength: "200K",
    description: "The simplest, most reliable way to write for free. OpenRouter dynamically routes to the fastest active free model.",
  },
  {
    id: "google/gemma-4-31b-it:free",
    name: "Google Gemma 4 31B",
    tag: "100% Free • Literary Choice",
    category: "free",
    isFree: true,
    contextLength: "256K",
    description: "Google DeepMind's flagship 31B dense model. Outstanding narrative voice, rich character depth, and literary prose.",
  },
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b:free",
    name: "NVIDIA Nemotron 3 Ultra",
    tag: "100% Free • 1M Context",
    category: "free",
    isFree: true,
    contextLength: "1,000K",
    description: "Frontier 550B reasoning and narrative model with 1 Million token context. Ideal for entire novel arcs and intricate screenplays.",
  },
  {
    id: "google/gemma-4-26b-a4b-it:free",
    name: "Google Gemma 4 26B",
    tag: "100% Free • Fast DeepMind",
    category: "free",
    isFree: true,
    contextLength: "256K",
    description: "Fast Mixture-of-Experts model from Google DeepMind. Great for rapid brainstorming, outlines, and chapter drafts.",
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    name: "NVIDIA Nemotron 3 Super",
    tag: "100% Free • 120B MoE",
    category: "free",
    isFree: true,
    contextLength: "262K",
    description: "120B-parameter open hybrid MoE model from NVIDIA. High compute efficiency and consistency across scene beats.",
  },
  {
    id: "nvidia/nemotron-3.5-lightning:free",
    name: "NVIDIA Nemotron 3.5 Lightning",
    tag: "100% Free • Ultra Fast",
    category: "free",
    isFree: true,
    contextLength: "1,000K",
    description: "Lightweight, ultra-fast generation with massive 1M context. Perfect for quick dialogue polish and scene punch-ups.",
  },
  {
    id: "thinkingmachines/inkling:free",
    name: "Thinking Machines Inkling",
    tag: "100% Free • 975B MoE",
    category: "free",
    isFree: true,
    contextLength: "1,048K",
    description: "Massive 975B mixture-of-experts model with over 1M context. Deeply creative world-building and lore generation.",
  },
  {
    id: "dots-studio/dots-3-note-preview:free",
    name: "Dots3-Note Preview",
    tag: "100% Free • 512K Context",
    category: "free",
    isFree: true,
    contextLength: "512K",
    description: "280B MoE model tuned for note-taking, screenplay treatments, and literary outlines.",
  },

  // ── POPULAR FLAGSHIP & ECONOMICAL MODELS (ACTIVE) ──
  {
    id: "deepseek/deepseek-chat",
    name: "DeepSeek V3",
    tag: "Ultra-Low Cost • High Quality",
    category: "flagship",
    isFree: false,
    contextLength: "163K",
    description: "Exceptional writing quality and narrative nuance at a tiny fraction of a cent per chapter.",
  },
  {
    id: "deepseek/deepseek-v4.1-flash",
    name: "DeepSeek V4.1 Flash",
    tag: "Ultra-Fast • 1M Context",
    category: "flagship",
    isFree: false,
    contextLength: "1,000K",
    description: "Blazingly fast generation with full 1M context at minimal cost. Great for long drafts.",
  },
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    tag: "Economical • Fast",
    category: "flagship",
    isFree: false,
    contextLength: "128K",
    description: "OpenAI's nimble model. Fast, dependable formatting for screenplays, outlines, and character bios.",
  },
  {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    tag: "Flagship Versatile",
    category: "flagship",
    isFree: false,
    contextLength: "128K",
    description: "OpenAI's flagship powerhouse. Superb structural adaptation, pacing, and multi-character dialogue.",
  },
  {
    id: "anthropic/claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    tag: "Literary Gold Standard",
    category: "flagship",
    isFree: false,
    contextLength: "1,000K",
    description: "Anthropic's latest literary marvel. Unmatched richness in poetic imagery, interior monologue, and pacing.",
  },
  {
    id: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    tag: "Fast Literary",
    category: "flagship",
    isFree: false,
    contextLength: "200K",
    description: "Speedy and affordable Claude model with strong narrative and dialogue instincts.",
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    name: "Llama 3.3 70B",
    tag: "Open Weights Flagship",
    category: "flagship",
    isFree: false,
    contextLength: "131K",
    description: "Meta's flagship 70B open model. Robust creative writing, dramatic scenes, and plot exploration.",
  },
  {
    id: "mistralai/mistral-large",
    name: "Mistral Large",
    tag: "Nuanced Storytelling",
    category: "flagship",
    isFree: false,
    contextLength: "128K",
    description: "Top-tier European flagship model with sophisticated pacing, prose, and multilingual storytelling.",
  },
];

export function normalizeOpenRouterModel(model?: string): string {
  if (!model) return "openrouter/free";
  const trimmed = model.trim();
  const legacyMap: Record<string, string> = {
    "anthropic/claude-3.5-sonnet": "anthropic/claude-sonnet-4.5",
    "anthropic/claude-3.7-sonnet": "anthropic/claude-sonnet-4.5",
    "deepseek/deepseek-r1": "deepseek/deepseek-chat",
    "mistralai/mistral-large-2411": "mistralai/mistral-large",
  };
  return legacyMap[trimmed] || trimmed;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  textProvider: "openrouter",
  openRouterApiKey: "",
  openRouterModel: "openrouter/free",
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
      textProvider: "openrouter",
      openRouterApiKey: parsed.openRouterApiKey?.trim() ?? "",
      openRouterModel: normalizeOpenRouterModel(parsed.openRouterModel),
      imagePollinationsApiKey: parsed.imagePollinationsApiKey?.trim() ?? "",
      imagePollinationsModel: parsed.imagePollinationsModel?.trim() || DEFAULT_AI_SETTINGS.imagePollinationsModel,
      imageCloudflareAccountId: parsed.imageCloudflareAccountId?.trim() ?? "",
      imageCloudflareApiToken: parsed.imageCloudflareApiToken?.trim() ?? "",
      imageCloudflareModel: parsed.imageCloudflareModel?.trim() || DEFAULT_AI_SETTINGS.imageCloudflareModel,
      imageProvider:
        parsed.imageProvider === "cloudflare"
          ? "cloudflare"
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
    textProvider: "openrouter",
    openRouterApiKey:
      settings.openRouterApiKey !== undefined
        ? (settings.openRouterApiKey || "").trim()
        : current.openRouterApiKey,
    openRouterModel: normalizeOpenRouterModel(
      settings.openRouterModel !== undefined
        ? (settings.openRouterModel || "").trim()
        : current.openRouterModel,
    ),
    imagePollinationsApiKey:
      settings.imagePollinationsApiKey !== undefined
        ? (settings.imagePollinationsApiKey || "").trim()
        : current.imagePollinationsApiKey,
    imagePollinationsModel:
      settings.imagePollinationsModel !== undefined
        ? (settings.imagePollinationsModel || "").trim() || DEFAULT_AI_SETTINGS.imagePollinationsModel
        : current.imagePollinationsModel,
    imageCloudflareAccountId:
      settings.imageCloudflareAccountId !== undefined
        ? (settings.imageCloudflareAccountId || "").trim()
        : current.imageCloudflareAccountId,
    imageCloudflareApiToken:
      settings.imageCloudflareApiToken !== undefined
        ? (settings.imageCloudflareApiToken || "").trim()
        : current.imageCloudflareApiToken,
    imageCloudflareModel:
      settings.imageCloudflareModel !== undefined
        ? (settings.imageCloudflareModel || "").trim() || DEFAULT_AI_SETTINGS.imageCloudflareModel
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
        textProvider: "openrouter",
        openRouterApiKey: data.openRouterApiKey?.trim() || local.openRouterApiKey || "",
        openRouterModel: normalizeOpenRouterModel(data.openRouterModel || local.openRouterModel),
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
          data.imageProvider === "cloudflare" || data.imageProvider === "pollinations"
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
    const rawMsg = (e as Error).message || "Failed to connect to OpenRouter.";
    const error = /Failed to fetch/i.test(rawMsg)
      ? "Unable to reach OpenRouter (Failed to fetch). Please check your internet connection or disable ad-blockers for openrouter.ai."
      : rawMsg;
    return {
      valid: false,
      error,
    };
  }
}
