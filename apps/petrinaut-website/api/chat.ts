import { createOpenAI } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  createProviderRegistry,
  safeValidateUIMessages,
  streamText,
  type ToolSet,
  type UIMessage,
} from "ai";
import { petrinautAiTools, petrinautAiPrompt } from "@hashintel/petrinaut/core";
import { z } from "zod";

declare const process: {
  env: Record<string, string | undefined>;
};

const DEFAULT_MODEL = "gpt-5.5-2026-04-23";
const MAX_REQUEST_BYTES = 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;

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

const getAllowedOrigins = (): Set<string> => {
  const configured = process.env.PETRINAUT_AI_ALLOWED_ORIGINS;
  const origins = new Set(
    configured
      ?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [],
  );

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    origins.add(`https://${vercelUrl}`);
  }

  return origins;
};

const mergeHeaders = (...headers: (HeadersInit | undefined)[]): Headers => {
  const merged = new Headers();
  for (const headerSet of headers) {
    if (!headerSet) {
      continue;
    }
    new Headers(headerSet).forEach((value, key) => {
      merged.set(key, value);
    });
  }
  return merged;
};

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: mergeHeaders({ "content-type": "application/json" }, init.headers),
  });

const logChatFailure = (
  reason: string,
  context: Record<string, unknown> = {},
) => {
  console.error(`[Petrinaut AI] ${reason}`, context);
};

const validationErrorBody = (
  error: unknown,
): { error: string; detail?: string } =>
  process.env.VERCEL_ENV === "production" || !(error instanceof Error)
    ? { error: "Invalid chat messages" }
    : { error: "Invalid chat messages", detail: error.message };

const corsHeaders = (request: Request): HeadersInit => {
  const origin = request.headers.get("origin");
  return origin &&
    (process.env.VERCEL_ENV !== "production" || getAllowedOrigins().has(origin))
    ? { "access-control-allow-origin": origin, vary: "Origin" }
    : { vary: "Origin" };
};

const isAllowedOrigin = (request: Request): boolean => {
  if (process.env.VERCEL_ENV !== "production") {
    return true;
  }

  const origin = request.headers.get("origin");
  return origin !== null && getAllowedOrigins().has(origin);
};

const getClientKey = (request: Request): string =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
  request.headers.get("x-real-ip") ??
  request.headers.get("user-agent") ??
  "unknown";

const checkRateLimit = (request: Request): boolean => {
  const key = getClientKey(request);
  const now = Date.now();
  const current = rateLimitBuckets.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(key, {
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

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: mergeHeaders(corsHeaders(request), {
        "access-control-allow-headers": "content-type",
        "access-control-allow-methods": "POST, OPTIONS",
      }),
    });
  }

  if (request.method !== "POST") {
    logChatFailure("Rejected unsupported method", {
      method: request.method,
    });
    return jsonResponse(
      { error: "Method not allowed" },
      {
        headers: corsHeaders(request),
        status: 405,
      },
    );
  }

  if (!isAllowedOrigin(request)) {
    logChatFailure("Rejected disallowed origin", {
      origin: request.headers.get("origin"),
    });
    return jsonResponse({ error: "Origin not allowed" }, { status: 403 });
  }

  if (!checkRateLimit(request)) {
    logChatFailure("Rejected rate-limited request", {
      clientKey: getClientKey(request),
    });
    return jsonResponse(
      { error: "Rate limit exceeded" },
      {
        headers: corsHeaders(request),
        status: 429,
      },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logChatFailure("Missing OpenAI API key");
    return jsonResponse(
      { error: "OPENAI_API_KEY is not configured" },
      {
        headers: corsHeaders(request),
        status: 500,
      },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_REQUEST_BYTES) {
    logChatFailure("Rejected oversized request by content-length", {
      contentLength,
      maxRequestBytes: MAX_REQUEST_BYTES,
    });
    return jsonResponse(
      { error: "Request too large" },
      {
        headers: corsHeaders(request),
        status: 413,
      },
    );
  }

  const rawBody = await request.text();
  const rawBodyBytes = new TextEncoder().encode(rawBody).byteLength;
  if (rawBodyBytes > MAX_REQUEST_BYTES) {
    logChatFailure("Rejected oversized request body", {
      maxRequestBytes: MAX_REQUEST_BYTES,
      rawBodyBytes,
    });
    return jsonResponse(
      { error: "Request too large" },
      {
        headers: corsHeaders(request),
        status: 413,
      },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch (error) {
    logChatFailure("Rejected invalid JSON", { error });
    return jsonResponse(
      { error: "Invalid JSON" },
      {
        headers: corsHeaders(request),
        status: 400,
      },
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    logChatFailure("Rejected invalid chat request", {
      error: parsed.error,
    });
    return jsonResponse(
      { error: "Invalid chat request" },
      {
        headers: corsHeaders(request),
        status: 400,
      },
    );
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
      headers: corsHeaders(request),
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

  return result.toUIMessageStreamResponse({
    headers: corsHeaders(request),
    sendReasoning: true,
  });
}
