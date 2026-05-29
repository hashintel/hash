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

import { oryKratosClient } from "../shared/ory-kratos";

import type { NextApiRequest, NextApiResponse } from "next";

const DEFAULT_MODEL = "gpt-5.5-2026-04-23";

/**
 * Per-user rate limit. The Petrinaut AI assistant is proxied through this
 * route so we can bill OpenAI usage to HASH's key without exposing it to the
 * sandboxed iframe; the limit keeps a single signed-in user from running away
 * with that key.
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
 * The HASH frontend runs as a long-lived Node server (`next start`), so this
 * map persists across requests for the lifetime of the process. It is best-
 * effort only: a multi-instance deployment would rate-limit per instance.
 */
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

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

/**
 * Resolve the signed-in user's Ory identity id from the request's session
 * cookie. Returns `null` when there's no valid session.
 */
const resolveUserId = async (cookie?: string): Promise<string | null> => {
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
 * API route that proxies the Petrinaut AI assistant's chat requests to OpenAI.
 *
 * The assistant runs inside a sandboxed null-origin iframe (see
 * `processes/[uuid]/embed`) which cannot reach this route directly — its
 * requests are relayed by the host page (`process-editor.tsx`) over the
 * postMessage bridge and fetched here with the user's session cookie.
 *
 * Requests must carry a valid HASH (Ory) session and are rate-limited per
 * user so a single account can't exhaust the shared OpenAI key.
 */
const handler = async (
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> => {
  if (req.method !== "POST") {
    logChatFailure("Rejected unsupported method", { method: req.method });
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const userId = await resolveUserId(req.headers.cookie);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  if (!checkRateLimit(userId)) {
    logChatFailure("Rejected rate-limited request", { userId });
    res.status(429).json({ error: "Rate limit exceeded" });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logChatFailure("Missing OpenAI API key");
    res.status(500).json({ error: "OPENAI_API_KEY is not configured" });
    return;
  }

  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    logChatFailure("Rejected invalid chat request", { error: parsed.error });
    res.status(400).json({ error: "Invalid chat request" });
    return;
  }

  const validatedMessages = await safeValidateUIMessages<UIMessage>({
    messages: parsed.data.messages,
    tools: petrinautAiValidationTools,
  });

  if (!validatedMessages.success) {
    logChatFailure("Rejected invalid chat messages", {
      error: validatedMessages.error,
    });
    res.status(400).json(validationErrorBody(validatedMessages.error));
    return;
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
  // `pipeUIMessageStreamToResponse` `onError` is what propagates a visible
  // error chunk to the client so `useChat` can surface a failure instead of
  // just quietly transitioning the status back to `"ready"`.
  result.pipeUIMessageStreamToResponse(res, {
    sendReasoning: true,
    onError: (error) => {
      logChatFailure("AI response error", { error });
      return error instanceof Error ? error.message : "AI request failed";
    },
  });
};

export default handler;
