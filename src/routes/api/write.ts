import { createFileRoute } from "@tanstack/react-router";
import { buildPrompt, type AiRequest } from "@/lib/ai/prompts";
import { verifyRequestUser } from "@/lib/ai/auth.server";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/integrations/firebase/client";
import { normalizeOpenRouterModel, type AiSettings } from "@/lib/settings";

const MODES = [
  "draft",
  "continue",
  "expand",
  "rewrite",
  "paraphrase",
  "script",
  "scenes",
  "bible",
  "locations",
  "logline",
];

function sanitizeError(raw: unknown, keyToRedact?: string | null): string {
  const msg =
    raw instanceof Error
      ? raw.message
      : typeof raw === "string"
        ? raw
        : "Failed to generate AI response";

  let clean = msg;
  if (keyToRedact && keyToRedact.length > 4) {
    clean = clean.replaceAll(keyToRedact, "[REDACTED_KEY]");
  }
  clean = clean.replace(/sk-[a-zA-Z0-9_\-]{16,}/gi, "[REDACTED_KEY]");
  clean = clean.replace(/Bearer\s+[A-Za-z0-9_\-.]+/gi, "Bearer [REDACTED]");
  return clean;
}

export const Route = createFileRoute("/api/write")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await verifyRequestUser(request);
        if (!userId) return Response.json({ error: "Please sign in again." }, { status: 401 });
        const body = (await request.json()) as AiRequest;
        if (!MODES.includes(body.mode) || typeof body.text !== "string") {
          return Response.json({ error: "Invalid request" }, { status: 400 });
        }
        const { instructions, input } = buildPrompt(body);

        // ── OpenRouter Text Generation ──
        let openRouterKey =
          request.headers.get("x-openrouter-key") || process.env["OPENROUTER_API_KEY"];
        let rawModel = request.headers.get("x-openrouter-model");

        // Fallback: If not passed in headers, check Firestore user_settings
        if (!openRouterKey && userId) {
          try {
            const snap = await getDoc(doc(db, "user_settings", userId));
            if (snap.exists()) {
              const data = snap.data() as Partial<AiSettings>;
              if (data.openRouterApiKey) openRouterKey = data.openRouterApiKey.trim();
              if (data.openRouterModel && !rawModel) rawModel = data.openRouterModel.trim();
            }
          } catch {
            /* ignore read errors */
          }
        }

        const openRouterModel = normalizeOpenRouterModel(rawModel || "openrouter/free");
        const isFreeModel =
          openRouterModel.includes(":free") || openRouterModel === "openrouter/free";

        if (openRouterKey) {
          // Keep default maxTokens reasonable (2500 for scripts, 2000 for bibles, 1200 for beats)
          const defaultMaxTokens =
            body.mode === "bible" || body.mode === "locations" || body.mode === "scenes"
              ? 2000
              : body.mode === "script"
                ? 2500
                : 1200;

          try {
            const makeOpenRouterRequest = async (tokens: number, enforceZdr = true) => {
              const payload: Record<string, unknown> = {
                model: openRouterModel,
                messages: [
                  { role: "system", content: instructions },
                  { role: "user", content: input },
                ],
                stream: true,
                max_tokens: tokens,
              };

              // Enforce Zero Data Retention / No-Training on paid models where providers support it.
              // Free endpoints are public demo models and do not support data_collection: "deny".
              if (enforceZdr && !isFreeModel) {
                payload["provider"] = { data_collection: "deny" };
              }

              return fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${openRouterKey}`,
                  "Content-Type": "application/json",
                  "HTTP-Referer": "https://inkwell.app",
                  "X-Title": "Inkwell",
                },
                body: JSON.stringify(payload),
                signal: request.signal,
              });
            };

            let openRouterRes = await makeOpenRouterRequest(defaultMaxTokens, true);

            if (!openRouterRes.ok) {
              let errorMsg = `OpenRouter error (${openRouterRes.status})`;
              try {
                const errJson = (await openRouterRes.json()) as { error?: { message?: string } };
                errorMsg = errJson?.error?.message || errorMsg;
              } catch {
                /* ignore */
              }

              // Fallback 1: If provider constraint failed (e.g. data_collection: "deny" not available for model)
              if (/data_collection|provider|endpoint/i.test(errorMsg)) {
                console.warn(
                  `[OpenRouter] Retrying ${openRouterModel} without strict provider constraint...`,
                );
                openRouterRes = await makeOpenRouterRequest(defaultMaxTokens, false);
                if (!openRouterRes.ok) {
                  try {
                    const retryErr = (await openRouterRes.json()) as {
                      error?: { message?: string };
                    };
                    errorMsg = retryErr?.error?.message || errorMsg;
                  } catch {
                    /* ignore */
                  }
                }
              }

              // Fallback 2: Auto-heal if rejected due to token affordability
              const affordMatch = errorMsg.match(/can only afford (\d+)/i);
              if (affordMatch && affordMatch[1]) {
                const affordable = parseInt(affordMatch[1], 10);
                if (affordable > 150) {
                  const safeTokens = Math.max(150, affordable - 15);
                  console.warn(
                    `[OpenRouter] Auto-retrying with affordable token count: ${safeTokens}`,
                  );
                  openRouterRes = await makeOpenRouterRequest(safeTokens, false);
                  if (!openRouterRes.ok) {
                    try {
                      const retryErr = (await openRouterRes.json()) as {
                        error?: { message?: string };
                      };
                      errorMsg = retryErr?.error?.message || errorMsg;
                    } catch {
                      /* ignore */
                    }
                  }
                }
              }

              if (!openRouterRes.ok) {
                return Response.json(
                  { error: sanitizeError(errorMsg, openRouterKey) },
                  { status: openRouterRes.status },
                );
              }
            }

            if (!openRouterRes.body) {
              return Response.json(
                { error: "No response stream returned by OpenRouter" },
                { status: 500 },
              );
            }

            const reader = openRouterRes.body.getReader();
            const decoder = new TextDecoder();
            const encoder = new TextEncoder();

            const transformedStream = new ReadableStream({
              async start(controller) {
                let buffer = "";
                let hasEnqueued = false;

                const processLine = (rawLine: string) => {
                  const trimmed = rawLine.trim();
                  if (!trimmed || trimmed === "data: [DONE]") return;
                  if (trimmed.startsWith("data: ")) {
                    try {
                      const json = JSON.parse(trimmed.slice(6));

                      // Check for in-stream error event from OpenRouter
                      if (json.error) {
                        const errMsg =
                          typeof json.error === "string"
                            ? json.error
                            : json.error.message || JSON.stringify(json.error);
                        controller.error(new Error(sanitizeError(errMsg, openRouterKey)));
                        return;
                      }

                      // Support delta.content, delta.text, choice.text, and reasoning content
                      const choice = json.choices?.[0];
                      const textChunk =
                        choice?.delta?.content ||
                        choice?.delta?.text ||
                        choice?.text ||
                        choice?.message?.content ||
                        (choice?.delta?.reasoning_content && !choice?.delta?.content
                          ? choice.delta.reasoning_content
                          : "") ||
                        "";

                      if (textChunk) {
                        hasEnqueued = true;
                        controller.enqueue(encoder.encode(textChunk));
                      }
                    } catch {
                      /* ignore unparseable chunk */
                    }
                  }
                };

                try {
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() ?? "";

                    for (const line of lines) {
                      processLine(line);
                    }
                  }

                  // Flush remaining buffer
                  if (buffer.trim()) {
                    processLine(buffer);
                  }

                  if (!hasEnqueued) {
                    controller.error(
                      new Error(
                        `Model "${openRouterModel}" returned an empty response. The provider may be busy or experiencing high traffic. Please try again or switch to another free model like Google Gemma 4 or Nemotron Ultra in Settings.`,
                      ),
                    );
                    return;
                  }

                  controller.close();
                } catch (err) {
                  controller.error(err);
                }
              },
            });

            return new Response(transformedStream, {
              headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Transfer-Encoding": "chunked",
              },
            });
          } catch (fetchErr) {
            const msg = sanitizeError(fetchErr, openRouterKey);
            return Response.json({ error: msg }, { status: 500 });
          }
        }

        return Response.json(
          {
            error:
              "AI is not configured. Please add your OpenRouter API key in Settings (top right).",
          },
          { status: 400 },
        );
      },
    },
  },
});
