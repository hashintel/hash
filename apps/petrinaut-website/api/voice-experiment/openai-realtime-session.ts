import { z } from "zod";

declare const process: {
  env: Record<string, string | undefined>;
};

const OPENAI_CLIENT_SECRETS_URL =
  "https://api.openai.com/v1/realtime/client_secrets";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_MAX_TRACKED_CLIENTS = 10_000;
const UPSTREAM_TIMEOUT_MS = 10_000;

const sessionConfig = {
  session: {
    type: "realtime",
    model: "gpt-realtime-2.1",
    output_modalities: ["audio"],
    instructions: [
      "You are running a short voice interview experiment with a domain expert.",
      "Interview the expert about how an urgent customer support escalation moves from the initial report to resolution.",
      "Ask one focused question at a time. Briefly acknowledge the answer, then ask the highest-value follow-up.",
      "Use record_process_step when the expert describes a process step. Use record_process_decision when they describe a branch or decision.",
      "The tools are experiment-only instrumentation. Never claim that their output was persisted to Brunch or Petrinaut.",
      "Keep spoken responses concise and natural.",
    ].join(" "),
    max_output_tokens: 600,
    audio: {
      input: {
        transcription: {
          model: "gpt-live-transcribe",
          delay: "low",
          prompt:
            "A process-model interview about urgent customer support escalations, incident ownership, handoffs, decisions, and resolution.",
        },
        turn_detection: null,
      },
      output: {
        voice: "marin",
      },
    },
    tools: [
      {
        type: "function",
        name: "record_process_step",
        description:
          "Record a process step mentioned by the expert for experiment instrumentation only.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            description: {
              type: "string",
              description: "What happens during the process step.",
            },
            name: {
              type: "string",
              description: "A short name for the process step.",
            },
            owner: {
              type: "string",
              description: "The role or team that owns the step, if known.",
            },
          },
          required: ["name", "description"],
        },
      },
      {
        type: "function",
        name: "record_process_decision",
        description:
          "Record a branch or decision mentioned by the expert for experiment instrumentation only.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            condition: {
              type: "string",
              description: "The condition that determines the path taken.",
            },
            outcomes: {
              type: "array",
              description: "The possible paths after the decision.",
              items: { type: "string" },
            },
          },
          required: ["condition", "outcomes"],
        },
      },
    ],
    tool_choice: "auto",
  },
} as const;

const upstreamResponseSchema = z.object({
  expires_at: z.number().int().positive(),
  value: z.string().min(1),
});

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

const jsonResponse = (body: unknown, init: ResponseInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
};

const logSessionFailure = (
  reason: string,
  context: Record<string, unknown> = {},
) => {
  // Never add request bodies, API keys, or upstream response bodies here.
  // oxlint-disable-next-line no-console
  console.error(`[OpenAI Realtime experiment] ${reason}`, context);
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

const isTrustedBrowserRequest = (request: Request): boolean => {
  const origin = request.headers.get("origin");
  const experiment = request.headers.get("x-voice-experiment");

  return (
    origin === new URL(request.url).origin && experiment === "openai-realtime"
  );
};

const createSafetyIdentifier = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const fetch = async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (request.method !== "POST") {
    logSessionFailure("Rejected unsupported method", {
      method: request.method,
    });
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  if (!isTrustedBrowserRequest(request)) {
    logSessionFailure("Rejected untrusted browser request");
    return jsonResponse({ error: "Forbidden" }, { status: 403 });
  }

  if ((await request.text()).trim() !== "") {
    logSessionFailure("Rejected browser-supplied session configuration");
    return jsonResponse(
      { error: "Request body must be empty" },
      { status: 400 },
    );
  }

  const clientIp = resolveClientIp(request);
  if (process.env.VERCEL_ENV === "production" && !clientIp) {
    logSessionFailure("Rejected production request without a client IP");
    return jsonResponse(
      { error: "Could not determine client IP" },
      { status: 400 },
    );
  }

  const clientKey = clientIp ?? "local-development";
  if (!checkRateLimit(clientKey)) {
    logSessionFailure("Rejected rate-limited request");
    return jsonResponse({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logSessionFailure("Missing OpenAI API key");
    return jsonResponse(
      { error: "OpenAI Realtime is not configured" },
      { status: 500 },
    );
  }

  const safetyIdentifier = await createSafetyIdentifier(
    `${apiKey}:${clientKey}`,
  );

  let upstreamResponse: Response;
  try {
    upstreamResponse = await globalThis.fetch(OPENAI_CLIENT_SECRETS_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "openai-safety-identifier": safetyIdentifier,
      },
      body: JSON.stringify(sessionConfig),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    logSessionFailure("Client-secret request failed", {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return jsonResponse(
      { error: "Could not start voice session" },
      { status: 502 },
    );
  }

  if (!upstreamResponse.ok) {
    logSessionFailure("OpenAI rejected the client-secret request", {
      status: upstreamResponse.status,
    });
    return jsonResponse(
      { error: "Could not start voice session" },
      { status: 502 },
    );
  }

  let upstreamBody: unknown;
  try {
    upstreamBody = await upstreamResponse.json();
  } catch {
    logSessionFailure("OpenAI returned invalid JSON");
    return jsonResponse(
      { error: "Could not start voice session" },
      { status: 502 },
    );
  }

  const parsed = upstreamResponseSchema.safeParse(upstreamBody);
  if (!parsed.success) {
    logSessionFailure("OpenAI returned an invalid client secret");
    return jsonResponse(
      { error: "Could not start voice session" },
      { status: 502 },
    );
  }

  return jsonResponse({
    clientSecret: parsed.data.value,
    expiresAt: parsed.data.expires_at,
  });
};

export default { fetch };
