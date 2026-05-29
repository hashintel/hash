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

import { petrinautAiPrompt, petrinautAiTools } from "@hashintel/petrinaut-core";

import { oryKratosClient } from "../../../pages/shared/ory-kratos";

/**
 * This endpoint is an App Router Route Handler — *not* a Pages Router API
 * route — specifically so it can stream. Pages Router API routes buffer the
 * entire response before flushing it (a documented Next.js limitation), which
 * defeated the token-by-token streaming the AI assistant relies on.
 *
 * `force-dynamic` keeps Next from trying to cache/optimise the handler.
 */
export const dynamic = "force-dynamic";

const DEFAULT_MODEL = "gpt-5.5-2026-04-23";

/**
 * Per-authenticated user rate limit.
 */
const RATE_LIMIT_WINDOW_MS = 30_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_MAX_TRACKED_USERS = 10_000;

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

/**
 * In-memory token buckets keyed by the authenticated user's Ory identity id.
 *
 * This is not a reliable global limit when this endpoint is deployed as a serverless function.
 *
 * @todo move this into the Node API or elsewhere for proper rate limiting
 */
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

const jsonResponse = (body: unknown, init: ResponseInit = {}): Response => {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
};

const logChatFailure = (
  reason: string,
  context: Record<string, unknown> = {},
) => {
  // eslint-disable-next-line no-console
  console.error(`[Petrinaut AI] ${reason}`, context);
};

const validationErrorBody = (
  error: unknown,
): { error: string; detail?: string } =>
  process.env.NODE_ENV === "production" || !(error instanceof Error)
    ? { error: "Invalid chat messages" }
    : { error: "Invalid chat messages", detail: error.message };

const checkRateLimit = (userId: string): boolean => {
  const now = Date.now();
  const current = rateLimitBuckets.get(userId);

  if (!current || current.resetAt <= now) {
    // The bucket map only grows; when it crosses the cap, drop every expired
    // bucket in one sweep before inserting the new one.
    if (rateLimitBuckets.size >= RATE_LIMIT_MAX_TRACKED_USERS) {
      for (const [key, bucket] of rateLimitBuckets) {
        if (bucket.resetAt <= now) {
          rateLimitBuckets.delete(key);
        }
      }
      if (rateLimitBuckets.size >= RATE_LIMIT_MAX_TRACKED_USERS) {
        return false;
      }
    }
    rateLimitBuckets.set(userId, {
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

const resolveUserId = async (cookie: string | null): Promise<string | null> => {
  if (!cookie) {
    return null;
  }
  try {
    const { data } = await oryKratosClient.toSession({ cookie });
    return data.identity?.id ?? null;
  } catch {
    return null;
  }
};

/**
 * Route Handler that proxies the Petrinaut AI assistant's chat requests to
 * OpenAI.
 *
 * The assistant runs inside a sandboxed null-origin iframe (see
 * `processes/[uuid]/embed`) which cannot reach this route directly — its
 * requests are relayed by the host page (`process-editor.tsx`) over the
 * postMessage bridge and fetched here with the user's session cookie.
 */
export const POST = async (request: Request): Promise<Response> => {
  const userId = await resolveUserId(request.headers.get("cookie"));
  if (!userId) {
    return jsonResponse({ error: "Not authenticated" }, { status: 401 });
  }

  if (!checkRateLimit(userId)) {
    logChatFailure("Rejected rate-limited request", { userId });
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
  // quietly transitioning the status back to `"ready"`.
  return result.toUIMessageStreamResponse({
    sendReasoning: true,
    onError: (error) => {
      logChatFailure("AI response error", { error });
      return error instanceof Error ? error.message : "AI request failed";
    },
  });
};
