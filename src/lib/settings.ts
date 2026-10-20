import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/integrations/firebase/client";

export type AiSettings = {
  openRouterApiKey: string;
  openRouterModel: string;
};

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
