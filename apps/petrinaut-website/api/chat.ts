import { createOpenAI } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  createProviderRegistry,
  safeValidateUIMessages,
  streamText,
  type ToolSet,
  type UIMessage,
} from "ai";
import { z } from "zod";

import { petrinautAiTools, petrinautAiPrompt } from "@hashintel/petrinaut-core";

declare const process: {
  env: Record<string, string | undefined>;
};

const DEFAULT_MODEL = "gpt-5.5-2026-04-23";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const RATE_LIMIT_MAX_TRACKED_CLIENTS = 10_000;

const requestSchema = z.object({
  id: z.string().optional(),
  messages: z.unknown(),
});

const petrinautAiValidationTools = Object.fromEntries(
  Object.entries(petrinautAiTools).map(([toolName, aiTool]) => [
    toolName,
    {
      description: aiTool.description,
      inputSchema: aiTool.inputSchema,
      outputSchema: z.unknown(),
    },
  ]),
) satisfies ToolSet;

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

const jsonResponse = (body: unknown, init: ResponseInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
};

const logChatFailure = (
  reason: string,
  context: Record<string, unknown> = {},
) => {
  // oxlint-disable-next-line no-console
  console.error(`[Petrinaut AI] ${reason}`, context);
};

const validationErrorBody = (
  error: unknown,
): { error: string; detail?: string } =>
  process.env.VERCEL_ENV === "production" || !(error instanceof Error)
    ? { error: "Invalid chat messages" }
    : { error: "Invalid chat messages", detail: error.message };

/**
 * Resolve the public client IP for rate-limiting.
 *
 * Vercel's edge overwrites `x-forwarded-for` with the real client IP and
 * refuses to forward externally-set values, so the header cannot be spoofed
 * by the caller. `x-vercel-forwarded-for` carries the same value but is also
 * immune to a custom proxy placed in front of Vercel.
 *
 * See https://vercel.com/docs/edge-network/headers/request-headers
 */
const resolveClientIp = (request: Request): string | null => {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return request.headers.get("x-vercel-forwarded-for");
};

const checkRateLimit = (clientIp: string): boolean => {
  const now = Date.now();
  const current = rateLimitBuckets.get(clientIp);

  if (!current || current.resetAt <= now) {
    // The bucket map only grows; on a warm function instance with many unique
    // clients it would accumulate indefinitely. When we cross the cap, drop
    // every expired bucket in one sweep before inserting the new one.
    if (rateLimitBuckets.size >= RATE_LIMIT_MAX_TRACKED_CLIENTS) {
      for (const [key, bucket] of rateLimitBuckets) {
        if (bucket.resetAt <= now) {
          rateLimitBuckets.delete(key);
        }
      }
    }
    rateLimitBuckets.set(clientIp, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return true;
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  current.count += 1;
  return true;
};

/**
 * API endpoint to proxy requests for AI assistance to OpenAI.
 *
 * Exported via a default `{ fetch }` object so Vercel's Node.js runtime treats
 * this as a Web fetch handler and hands us a `Request`. Without this opt-in,
 * the default export is invoked with a Node.js `IncomingMessage`, whose
 * `headers` is a plain object (no `.get(...)` method) and would crash
 * `resolveClientIp`.
 *
 * See https://vercel.com/changelog/node-js-vercel-functions-now-support-fetch-web-handlers
 */
const fetch = async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    // We'll always serve this same-origin so we don't need any CORS config
    return new Response(null, { status: 204 });
  }

  if (request.method !== "POST") {
    logChatFailure("Rejected unsupported method", { method: request.method });
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  const clientIp = resolveClientIp(request);
  if (process.env.VERCEL_ENV === "production" && !clientIp) {
    // Vercel's edge always sets x-forwarded-for in production. If it isn't
    // present, the request reached us through an unexpected path and we have
    // no way to rate-limit it - reject conservatively rather than fail open.
    logChatFailure("Rejected production request with no resolvable client IP");
    return jsonResponse(
      { error: "Could not determine client IP" },
      { status: 400 },
    );
  }

  if (clientIp && !checkRateLimit(clientIp)) {
    logChatFailure("Rejected rate-limited request", { clientIp });
    return jsonResponse({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logChatFailure("Missing OpenAI API key");
    return jsonResponse(
      { error: "OPENAI_API_KEY is not configured" },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    logChatFailure("Rejected invalid JSON", { error });
    return jsonResponse({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    logChatFailure("Rejected invalid chat request", { error: parsed.error });
    return jsonResponse({ error: "Invalid chat request" }, { status: 400 });
  }

  const validatedMessages = await safeValidateUIMessages<UIMessage>({
    messages: parsed.data.messages,
    tools: petrinautAiValidationTools,
  });

  if (!validatedMessages.success) {
    logChatFailure("Rejected invalid chat messages", {
      error: validatedMessages.error,
    });
    return jsonResponse(validationErrorBody(validatedMessages.error), {
      status: 400,
    });
  }

  const openai = createOpenAI({ apiKey });
  const registry = createProviderRegistry({ openai });
  const modelId = process.env.PETRINAUT_AI_MODEL ?? DEFAULT_MODEL;

  const result = streamText({
    model: registry.languageModel(`openai:${modelId}`),
    system: petrinautAiPrompt,
    messages: await convertToModelMessages(validatedMessages.data, {
      tools: petrinautAiTools,
    }),
    tools: petrinautAiTools,
    providerOptions: {
      openai: {
        reasoningEffort: "medium",
        reasoningSummary: "auto",
        textVerbosity: "medium",
      },
    },
    onError: ({ error }) => {
      logChatFailure("AI stream error", { error });
    },
  });

  return result.toUIMessageStreamResponse({ sendReasoning: true });
};

export default { fetch };
