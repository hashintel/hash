import { z } from "zod";

declare const process: {
  env: Record<string, string | undefined>;
};

const ELEVENLABS_CONVERSATION_TOKEN_URL =
  "https://api.elevenlabs.io/v1/convai/conversation/token";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_MAX_TRACKED_CLIENTS = 10_000;
const UPSTREAM_TIMEOUT_MS = 10_000;

const upstreamResponseSchema = z.object({
  conversation_id: z.string().min(1),
  token: z.string().min(1),
});

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

const jsonResponse = (body: unknown, init: ResponseInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
};

const logTokenFailure = (
  reason: string,
  context: Record<string, unknown> = {},
) => {
  // Never add request bodies, API keys, or upstream response bodies here.
  // oxlint-disable-next-line no-console
  console.error(`[ElevenLabs voice experiment] ${reason}`, context);
};

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

const checkRateLimit = (clientKey: string): boolean => {
  const now = Date.now();
  const current = rateLimitBuckets.get(clientKey);

  if (!current || current.resetAt <= now) {
    if (rateLimitBuckets.size >= RATE_LIMIT_MAX_TRACKED_CLIENTS) {
      for (const [key, bucket] of rateLimitBuckets) {
        if (bucket.resetAt <= now) {
          rateLimitBuckets.delete(key);
        }
      }
      if (rateLimitBuckets.size >= RATE_LIMIT_MAX_TRACKED_CLIENTS) {
        return false;
      }
    }
    rateLimitBuckets.set(clientKey, {
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

const isTrustedBrowserRequest = (request: Request): boolean =>
  request.headers.get("origin") === new URL(request.url).origin &&
  request.headers.get("x-voice-experiment") === "elevenlabs-brunch";

const fetch = async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (request.method !== "POST") {
    logTokenFailure("Rejected unsupported method", { method: request.method });
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  if (!isTrustedBrowserRequest(request)) {
    logTokenFailure("Rejected untrusted browser request");
    return jsonResponse({ error: "Forbidden" }, { status: 403 });
  }

  if ((await request.text()).trim() !== "") {
    logTokenFailure("Rejected browser-supplied speech-engine configuration");
    return jsonResponse(
      { error: "Request body must be empty" },
      { status: 400 },
    );
  }

  const clientIp = resolveClientIp(request);
  if (process.env.VERCEL_ENV === "production" && !clientIp) {
    logTokenFailure("Rejected production request without a client IP");
    return jsonResponse(
      { error: "Could not determine client IP" },
      { status: 400 },
    );
  }

  if (!checkRateLimit(clientIp ?? "local-development")) {
    logTokenFailure("Rejected rate-limited request");
    return jsonResponse({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const speechEngineId = process.env.ELEVENLABS_SPEECH_ENGINE_ID;
  if (!apiKey || !speechEngineId) {
    logTokenFailure("Missing ElevenLabs server configuration");
    return jsonResponse(
      { error: "ElevenLabs voice is not configured" },
      { status: 500 },
    );
  }

  const upstreamUrl = new URL(ELEVENLABS_CONVERSATION_TOKEN_URL);
  upstreamUrl.searchParams.set("agent_id", speechEngineId);

  let upstreamResponse: Response;
  try {
    upstreamResponse = await globalThis.fetch(upstreamUrl.toString(), {
      method: "GET",
      headers: { "xi-api-key": apiKey },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    logTokenFailure("Conversation-token request failed", {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return jsonResponse(
      { error: "Could not start ElevenLabs voice session" },
      { status: 502 },
    );
  }

  if (!upstreamResponse.ok) {
    logTokenFailure("ElevenLabs rejected the conversation-token request", {
      status: upstreamResponse.status,
    });
    return jsonResponse(
      { error: "Could not start ElevenLabs voice session" },
      { status: 502 },
    );
  }

  let upstreamBody: unknown;
  try {
    upstreamBody = await upstreamResponse.json();
  } catch {
    logTokenFailure("ElevenLabs returned invalid JSON");
    return jsonResponse(
      { error: "Could not start ElevenLabs voice session" },
      { status: 502 },
    );
  }

  const parsed = upstreamResponseSchema.safeParse(upstreamBody);
  if (!parsed.success) {
    logTokenFailure("ElevenLabs returned an invalid conversation token");
    return jsonResponse(
      { error: "Could not start ElevenLabs voice session" },
      { status: 502 },
    );
  }

  return jsonResponse({
    conversationId: parsed.data.conversation_id,
    conversationToken: parsed.data.token,
  });
};

export default { fetch };
