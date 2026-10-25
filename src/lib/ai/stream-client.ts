import { auth } from "@/integrations/firebase/client";
import { getAiSettings, loadAiSettings } from "@/lib/settings";
import type { AiRequest } from "./prompts";

/** Streams AI text from /api/write, calling onChunk with the accumulated text. */
export async function streamWrite(
  req: AiRequest,
  onChunk: (full: string) => void,
  signal?: AbortSignal,
) {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : "";
  let aiSettings = getAiSettings();

  // If local settings lack API key but user is authenticated, load from Firestore
  if (!aiSettings.openRouterApiKey && auth.currentUser) {
    try {
      aiSettings = await loadAiSettings(auth.currentUser.uid);
    } catch {
      /* ignore */
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  if (aiSettings.openRouterApiKey) {
    headers["x-openrouter-key"] = aiSettings.openRouterApiKey;
    headers["x-openrouter-model"] = aiSettings.openRouterModel;
  }

  headers["x-text-provider"] = "openrouter";

  let res: Response;
  try {
    res = await fetch("/api/write", {
      method: "POST",
      headers,
      body: JSON.stringify(req),
      signal: signal ?? null,
    });
  } catch (err: unknown) {
    const error = err as Error;
    if (error.name === "AbortError") {
      throw new Error("AI generation was cancelled.");
    }
    throw new Error(
      `Network connection failed (${error.message || "Failed to fetch"}). Please check your internet connection or verify the server is running.`,
    );
  }

  if (!res.ok || !res.body) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = (await res.json()) as { error?: string };
      msg = j.error ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      full += dec.decode(value, { stream: true });
      onChunk(full);
    }
  } catch (readErr: unknown) {
    const err = readErr as Error;
    if (err.name === "AbortError") {
      throw new Error("AI generation was cancelled.");
    }
    if (!full.trim()) {
      throw new Error(
        `Stream interrupted: ${err.message || "Connection lost"}. Please try again or switch to another model in Settings.`,
      );
    }
    console.warn("[streamWrite] Stream ended prematurely with partial content:", readErr);
  }

  // Handle accidental JSON error payloads
  if (full.startsWith('{"error":')) {
    try {
      const parsed = JSON.parse(full);
      if (parsed.error) {
        throw new Error(parsed.error);
      }
    } catch (e) {
      if ((e as Error).message !== "Unexpected token") throw e;
    }
  }

  // Check for in-stream error tag
  if (full.includes("[Error: ")) {
    const match = full.match(/\[Error:\s*(.*?)\]/);
    if (match && match[1]) {
      // If we got no other content, throw the error
      const cleaned = full.replace(/\[Error:\s*.*?\]/g, "").trim();
      if (!cleaned) {
        throw new Error(match[1]);
      }
    }
  }

  if (!full.trim()) {
    throw new Error(
      "The AI returned an empty response. The selected model may be busy or rate-limited. Please try again or switch to another free model (such as Google Gemma 4 or Nemotron Ultra) in Settings.",
    );
  }
  return full;
}
