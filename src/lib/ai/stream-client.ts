import { auth } from "@/integrations/firebase/client";
import { getAiSettings } from "@/lib/settings";
import type { AiRequest } from "./prompts";

/** Streams AI text from /api/write, calling onChunk with the accumulated text. */
export async function streamWrite(
  req: AiRequest,
  onChunk: (full: string) => void,
  signal?: AbortSignal,
) {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : "";
  const aiSettings = getAiSettings();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  if (aiSettings.openRouterApiKey) {
    headers["x-openrouter-key"] = aiSettings.openRouterApiKey;
    headers["x-openrouter-model"] = aiSettings.openRouterModel;
  }

  if (aiSettings.geminiApiKey) {
    headers["x-gemini-key"] = aiSettings.geminiApiKey;
    headers["x-gemini-model"] = aiSettings.geminiModel;
  }

  headers["x-text-provider"] = aiSettings.textProvider || "openrouter";

  const res = await fetch("/api/write", {
    method: "POST",
    headers,
    body: JSON.stringify(req),
    signal: signal ?? null,
  });
  if (!res.ok || !res.body) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      msg = j.error ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    full += dec.decode(value, { stream: true });
    onChunk(full);
  }
  if (!full.trim()) throw new Error("The AI returned nothing. Please try again.");
  return full;
}
