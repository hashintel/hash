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

import { createPetrinautAiGuard } from "../src/server/auth/petrinaut-auth";

import type { OAuthSession } from "@hashintel/oauth-session";

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
 * Whether this caller may spend another request in the current window.
 *
 * Keyed on the signed-in account, not the client IP. Every request that reaches
 * here is authenticated, and one account can arrive from as many addresses as
 * it likes, so an address-keyed bucket bounds the wrong thing.
 *
 * The buckets live in module scope, so each warm function instance keeps its
 * own and a cold start forgets them. That makes the effective cap a multiple of
 * the constant above rather than the constant itself — enough to stop a single
 * runaway client, not a distributed one.
 */
const checkRateLimit = (rateLimitKey: string): boolean => {
  const now = Date.now();
  const current = rateLimitBuckets.get(rateLimitKey);

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
      if (rateLimitBuckets.size >= RATE_LIMIT_MAX_TRACKED_CLIENTS) {
        // If we've somehow hit the client cap, refuse the request.
        return false;
      }
    }
    rateLimitBuckets.set(rateLimitKey, {
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

const requireSignedIn = createPetrinautAiGuard(process.env);

/**
 * Proxy a request for AI assistance to OpenAI, on behalf of a signed-in user.
 *
 * Only reached through {@link requireSignedIn}, so `session` is the identity
 * that got past the guard rather than anything read out of the request here.
 */
const handleChat = async (
  request: Request,
  session: OAuthSession,
): Promise<Response> => {
  if (!checkRateLimit(session.sub)) {
    logChatFailure("Rejected rate-limited request", { sub: session.sub });
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

  // `streamText`'s own `onError` only logs server-side — the
  // `toUIMessageStreamResponse` `onError` is what propagates a visible error
  // chunk to the client so `useChat` can surface a failure instead of just
  // quietly transitioning the status back to `"ready"` on a truncated stream.
  return result.toUIMessageStreamResponse({
    sendReasoning: true,
    onError: (error) => {
      logChatFailure("AI response error", { error });
      return error instanceof Error ? error.message : "AI request failed";
    },
  });
};

/**
 * API endpoint to proxy requests for AI assistance to OpenAI.
 *
 * Exported via a default `{ fetch }` object so Vercel's Node.js runtime treats
 * this as a Web fetch handler and hands us a `Request`. Without this opt-in,
 * the default export is invoked with a Node.js `IncomingMessage`, whose
 * `headers` is a plain object with no `.get(...)` method, and the session
 * cookie could not be read.
 *
 * See https://vercel.com/changelog/node-js-vercel-functions-now-support-fetch-web-handlers
 */
const fetch = async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    // We'll always serve this same-origin so we don't need any CORS config
    return new Response(null, { status: 204 });
  }

  // Ahead of the guard, so a preflight and a wrong verb are answered as such
  // rather than as a request to sign in.
  if (request.method !== "POST") {
    logChatFailure("Rejected unsupported method", { method: request.method });
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  return requireSignedIn(handleChat)(request);
};

export default { fetch };
