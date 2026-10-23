import { createFileRoute } from "@tanstack/react-router";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { buildPrompt, type AiRequest } from "@/lib/ai/prompts";
import { verifyRequestUser } from "@/lib/ai/auth.server";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "@/lib/ai/run-id.server";

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

        const textProvider = request.headers.get("x-text-provider") || "openrouter";

        // ── Gemini Text Generation ──
        const geminiKey =
          request.headers.get("x-gemini-key") || process.env["GEMINI_API_KEY"];
        let rawModel = request.headers.get("x-gemini-model") || "gemini-3.8-flash";
        let geminiModel = rawModel.trim().replace(/^models\//, "");
        if (
          geminiModel === "gemini-2.5-flash" ||
          geminiModel === "gemini-1.5-flash" ||
          geminiModel.includes("2.5-flash")
        ) {
          geminiModel = "gemini-3.8-flash";
        } else if (geminiModel === "gemini-2.5-pro" || geminiModel.includes("2.5-pro")) {
          geminiModel = "gemini-3.8-pro";
        }

        // Helper to stream Gemini text generation
        const runGemini = async () => {
          if (!geminiKey) return null;
          const maxTokens =
            body.mode === "bible" || body.mode === "locations"
              ? 3500
              : body.mode === "script"
                ? 8192
                : 1500;

          const makeGeminiRequest = async (model: string) => {
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(geminiKey)}`;
            return fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: instructions }] },
                contents: [{ parts: [{ text: input }] }],
                generationConfig: {
                  maxOutputTokens: maxTokens,
                  temperature: 0.85,
                },
              }),
              signal: request.signal,
            });
          };

          let geminiRes = await makeGeminiRequest(geminiModel);

          if (!geminiRes.ok) {
            let errorMsg = `Gemini error (${geminiRes.status})`;
            try {
              const errJson = await geminiRes.json();
              errorMsg = (errJson as any)?.error?.message || errorMsg;
            } catch {
              /* ignore */
            }

            if (
              geminiModel !== "gemini-3.8-flash" &&
              (errorMsg.includes("no longer available") ||
                errorMsg.includes("gemini-3.8-flash") ||
                geminiRes.status === 404)
            ) {
              console.warn(`[Gemini] ${geminiModel} unavailable (${errorMsg}), retrying with gemini-3.8-flash`);
              geminiRes = await makeGeminiRequest("gemini-3.8-flash");
              if (!geminiRes.ok) {
                let retryErrorMsg = `Gemini error (${geminiRes.status})`;
                try {
                  const retryErr = await geminiRes.json();
                  retryErrorMsg = (retryErr as any)?.error?.message || retryErrorMsg;
                } catch {
                  /* ignore */
                }
                return Response.json({ error: retryErrorMsg }, { status: geminiRes.status });
              }
            } else {
              return Response.json({ error: errorMsg }, { status: geminiRes.status });
            }
          }

          if (!geminiRes.body) {
            return Response.json(
              { error: "No response stream returned by Gemini" },
              { status: 500 },
            );
          }

          const reader = geminiRes.body.getReader();
          const decoder = new TextDecoder();
          const encoder = new TextEncoder();

          const transformedStream = new ReadableStream({
            async start(controller) {
              let buffer = "";
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  buffer += decoder.decode(value, { stream: true });
                  const lines = buffer.split("\n");
                  buffer = lines.pop() ?? "";

                  for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith("data: ")) continue;
                    const dataStr = trimmed.slice(6);
                    if (dataStr === "[DONE]") continue;
                    try {
                      const json = JSON.parse(dataStr);
                      const parts = json.candidates?.[0]?.content?.parts;
                      if (parts) {
                        for (const part of parts) {
                          if (part.text) {
                            controller.enqueue(encoder.encode(part.text));
                          }
                        }
                      }
                    } catch {
                      /* ignore unparseable chunk */
                    }
                  }
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
        };

        if (textProvider === "gemini" && geminiKey) {
          try {
            const resp = await runGemini();
            if (resp) return resp;
          } catch (fetchErr) {
            const msg = (fetchErr as Error).message || "Failed to connect to Gemini";
            return Response.json({ error: msg }, { status: 500 });
          }
        }

        // ── OpenRouter Text Generation ──
        const openRouterKey =
          request.headers.get("x-openrouter-key") || process.env["OPENROUTER_API_KEY"];
        const openRouterModel =
          request.headers.get("x-openrouter-model") || "anthropic/claude-3.5-sonnet";

        if ((textProvider === "openrouter" || !geminiKey) && openRouterKey) {
          // Keep default maxTokens reasonable (2500 for scripts, 2000 for bibles, 1200 for beats)
          // OpenRouter reserves balance based on max_tokens upfront
          const defaultMaxTokens =
            body.mode === "bible" || body.mode === "locations"
              ? 2000
              : body.mode === "script"
                ? 2500
                : 1200;

          try {
            const makeOpenRouterRequest = async (tokens: number) => {
              return fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${openRouterKey}`,
                  "Content-Type": "application/json",
                  "HTTP-Referer": "https://inkwell.app",
                  "X-Title": "Inkwell",
                },
                body: JSON.stringify({
                  model: openRouterModel,
                  messages: [
                    { role: "system", content: instructions },
                    { role: "user", content: input },
                  ],
                  stream: true,
                  max_tokens: tokens,
                }),
                signal: request.signal,
              });
            };

            let openRouterRes = await makeOpenRouterRequest(defaultMaxTokens);

            if (!openRouterRes.ok) {
              let errorMsg = `OpenRouter error (${openRouterRes.status})`;
              try {
                const errJson = (await openRouterRes.json()) as { error?: { message?: string } };
                errorMsg = errJson?.error?.message || errorMsg;
              } catch {
                /* ignore */
              }

              // Auto-heal if OpenRouter rejected due to max_tokens affordability:
              // e.g. "You requested up to 8192 tokens, but can only afford 2376"
              const affordMatch = errorMsg.match(/can only afford (\d+)/i);
              if (affordMatch && affordMatch[1]) {
                const affordable = parseInt(affordMatch[1], 10);
                if (affordable > 150) {
                  const safeTokens = Math.max(150, affordable - 15);
                  console.warn(`[OpenRouter] Auto-retrying with affordable token count: ${safeTokens}`);
                  openRouterRes = await makeOpenRouterRequest(safeTokens);
                  if (!openRouterRes.ok) {
                    try {
                      const retryErr = (await openRouterRes.json()) as { error?: { message?: string } };
                      errorMsg = retryErr?.error?.message || errorMsg;
                    } catch {
                      /* ignore */
                    }
                  }
                }
              }

              if (!openRouterRes.ok) {
                // If OpenRouter credit is exhausted and Gemini key is available, fallback to Gemini!
                if (geminiKey) {
                  console.warn(`[OpenRouter] Low credits / error (${errorMsg}), auto-routing to Google Gemini`);
                  try {
                    const geminiFallback = await runGemini();
                    if (geminiFallback) return geminiFallback;
                  } catch (e) {
                    console.error("Gemini fallback failed:", e);
                  }
                }

                return Response.json(
                  { error: `${errorMsg} (Tip: You can switch to Google Gemini in Settings for free quota without token balance limits)` },
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
                try {
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() ?? "";

                    for (const line of lines) {
                      const trimmed = line.trim();
                      if (!trimmed || trimmed === "data: [DONE]") continue;
                      if (trimmed.startsWith("data: ")) {
                        try {
                          const json = JSON.parse(trimmed.slice(6));
                          const content = json.choices?.[0]?.delta?.content || "";
                          if (content) {
                            controller.enqueue(encoder.encode(content));
                          }
                        } catch {
                          /* ignore unparseable chunk */
                        }
                      }
                    }
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
            const msg = (fetchErr as Error).message || "Failed to connect to OpenRouter";
            return Response.json({ error: msg }, { status: 500 });
          }
        }

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) {
          return Response.json(
            {
              error:
                "AI is not configured. Please add your OpenRouter API key in Settings (top right).",
            },
            { status: 400 },
          );
        }

        const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
        const provider = createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey,
          headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
          fetch: runIdFetch.fetch,
        });
        let upstreamError: string | null = null;
        const result = streamText({
          model: provider.responses("openai/gpt-6-astra"),
          instructions,
          messages: [{ role: "user", content: input }],
          abortSignal: request.signal,
          providerOptions: {
            openai: {
              forceReasoning: true,
              reasoningEffort: "low",
              reasoningSummary: "auto",
              store: false,
              include: ["reasoning.encrypted_content"],
            },
          },
          onError: ({ error }) => {
            upstreamError = error instanceof Error ? error.message : String(error);
            console.error("AI error", upstreamError);
          },
        });
        void upstreamError;
        return withLovableAiGatewayRunIdHeader(result.toTextStreamResponse(), runIdFetch);
      },
    },
  },
});
