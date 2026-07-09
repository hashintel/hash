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

import {
  petrinautAiPrompt,
  petrinautAiTools,
} from "@hashintel/petrinaut-core/ai";
import { apiOrigin } from "@local/hash-isomorphic-utils/environment";

/**
 * Proxies the Petrinaut AI assistant's chat requests to OpenAI, streaming the
 * response token-by-token.
 *
 * RUNTIME: this is a Pages Router API route pinned to the **Edge runtime**, and
 * that combination is load-bearing:
 * - It can't be an App Router Route Handler: this repo sets a custom
 *   `pageExtensions` (`.page.tsx` / `.api.ts`), which is fundamentally
 *   incompatible with App Router route handlers — the build dies with an
 *   `ENOENT` on `route_client-reference-manifest.js` (Next.js #76955 / #71992).
 * - It can't be a Node Pages Router route: those stream under `next dev` and
 *   self-hosted `next start`, but Vercel's Node serverless functions buffer the
 *   whole response and only flush at the end (Vercel-confirmed in
 *   vercel/next.js#67026), which kills incremental streaming.
 * - The Edge runtime returns a Web `Response` backed by a `ReadableStream`, so
 *   it streams everywhere — including Vercel.
 *
 * The assistant runs inside a sandboxed null-origin iframe (see
 * `processes/[uuid]/embed`) which cannot reach this route directly — its
 * requests are relayed by the host page (`process-editor.tsx`) over the
 * postMessage bridge and fetched here with the user's session cookie.
 *
 * Requests must carry a valid HASH (Ory) session and are rate-limited per user
 * so a single account can't exhaust the shared OpenAI key.
 */
export const config = {
  runtime: "edge",
};

const DEFAULT_MODEL = "gpt-5.5-2026-04-23";

/**
 * Per-authenticated user rate limit (best effort only, see `checkRateLimit` for details).
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
 * This is best-effort and NOT a reliable global limit, because the
 * map only lives within a single isolate/process. On serverless functions,
 * this means users can appear in buckets across different instances.
 *
 * It's kept as a cheap per-instance backstop against trivial loops. A real
 * cross-instance limit (so one account can't exhaust the shared OpenAI key)
 * needs a shared store — e.g. Upstash Redis via `@upstash/ratelimit`, keyed by
 * the Ory id. @todo move to a durable store before relying on this.
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
const resolveUserId = async (cookie: string | null): Promise<string | null> => {
  if (!cookie) {
    return null;
  }
  try {
    // We cannot use the Ory SDK here because it is not edge-safe.
    const response = await fetch(`${apiOrigin}/auth/sessions/whoami`, {
      headers: { cookie },
    });
    if (!response.ok) {
      return null;
    }
    const session = (await response.json()) as {
      identity?: { id?: string };
    };
    return session.identity?.id ?? null;
  } catch {
    return null;
  }
};

const jsonResponse = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const userId = await resolveUserId(request.headers.get("cookie"));
  if (!userId) {
    return jsonResponse({ error: "Not authenticated" }, 401);
  }

  if (!checkRateLimit(userId)) {
    logChatFailure("Rejected rate-limited request", { userId });
    return jsonResponse({ error: "Rate limit exceeded" }, 429);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logChatFailure("Missing OpenAI API key");
    return jsonResponse({ error: "OPENAI_API_KEY is not configured" }, 500);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid chat request" }, 400);
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    logChatFailure("Rejected invalid chat request", { error: parsed.error });
    return jsonResponse({ error: "Invalid chat request" }, 400);
  }

  const validatedMessages = await safeValidateUIMessages<UIMessage>({
    messages: parsed.data.messages,
    tools: petrinautAiValidationTools,
  });

  if (!validatedMessages.success) {
    logChatFailure("Rejected invalid chat messages", {
      error: validatedMessages.error,
    });
    return jsonResponse(validationErrorBody(validatedMessages.error), 400);
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
  // chunk to the client so `useChat` can surface a failure instead of quietly
  // transitioning the status back to `"ready"`.
  return result.toUIMessageStreamResponse({
    sendReasoning: true,
    onError: (error) => {
      logChatFailure("AI response error", { error });
      return error instanceof Error ? error.message : "AI request failed";
    },
  });
}
