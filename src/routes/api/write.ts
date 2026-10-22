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

        const openRouterKey =
          request.headers.get("x-openrouter-key") || process.env["OPENROUTER_API_KEY"];
        const openRouterModel =
          request.headers.get("x-openrouter-model") || "anthropic/claude-3.5-sonnet";

        if (openRouterKey) {
          const maxTokens =
            body.mode === "bible" ? 2500 : body.mode === "script" ? 8192 : 1500;

          try {
            const openRouterRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
                max_tokens: maxTokens,
              }),
              signal: request.signal,
            });

            if (!openRouterRes.ok) {
              let errorMsg = `OpenRouter error (${openRouterRes.status})`;
              try {
                const errJson = (await openRouterRes.json()) as { error?: { message?: string } };
                errorMsg = errJson?.error?.message || errorMsg;
              } catch {
                /* ignore */
              }
              return Response.json({ error: errorMsg }, { status: openRouterRes.status });
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
