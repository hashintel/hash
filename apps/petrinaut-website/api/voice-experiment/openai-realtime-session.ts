import { z } from "zod";

declare const process: {
  env: Record<string, string | undefined>;
};

const OPENAI_CLIENT_SECRETS_URL =
  "https://api.openai.com/v1/realtime/client_secrets"; // nosemgrep: hardcoded_secrets.node_secret
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_MAX_TRACKED_CLIENTS = 10_000;
const UPSTREAM_TIMEOUT_MS = 10_000;

const mockSessionConfig = {
  session: {
    type: "realtime",
    model: "gpt-realtime-2.1",
    output_modalities: ["audio"],
    instructions: [
      "# Role and Objective",
      "You are a voice elicitation agent helping a domain expert describe a process well enough to draft a Stochastic Dynamic Coloured Petri Net in Petrinaut.",
      "Do not assume a particular domain. Let the expert's first substantive statement establish the process being modeled.",
      "# Conversation Flow",
      "Work through these phases in order, while following the expert when they reveal important details early:",
      "1. Scope: establish the process goal, the entity or token being modeled, and the start and end boundaries.",
      "2. Structure: identify stable states, queues, and resources as candidate places; identify activities, events, and handoffs as candidate transitions; then establish their order.",
      "3. Logic: identify branches and their conditions, loops and retries, concurrency, failure paths, and the flows that enable or consume each step.",
      "4. Dynamics and evaluation: identify timing or rates, capacity constraints, useful metrics, and scenarios the model should support.",
      "5. Confirmation: give a brief recap of the understood model and ask for one correction or missing detail at a time.",
      "# Turn Discipline",
      "Ask exactly one short, focused question in each spoken response.",
      "Briefly acknowledge the answer, then ask only the highest-value missing fact.",
      "Do not advance until the current question has been meaningfully answered.",
      "If the expert gives a terse reply such as yes or no without the requested detail, clarify the same gap instead of repeating the question verbatim or moving on.",
      "Do not speak again unless there is new, meaningful expert input or you are continuing immediately after recording an explicit fact with a tool.",
      "Avoid compound questions and keep each spoken response to one or two concise sentences.",
      "# Tools",
      "All tools are dummy, experiment-only instrumentation. Never claim that their output was persisted to Brunch, Petrinaut, or any authoritative model.",
      "Record only facts explicitly supplied or confirmed by the expert. Do not invent missing model elements.",
      "Use record_process_state for a candidate place, record_process_step for a candidate transition, record_process_decision for branching logic, record_process_flow for a candidate arc, and record_model_requirement for timing, capacity, metrics, scenarios, or assumptions.",
      "When facts need recording, call every required recording tool before emitting spoken audio for that turn.",
      "Never begin an acknowledgment or question and then pause it to call a tool.",
      "Do not narrate tool use. After the tool results return, speak exactly one short next question.",
      "# Silence and Background Audio",
      "If the input is silence, background noise, television or speaker audio, a side conversation, your own playback, or speech not addressed to you, call wait_for_user and do not respond conversationally afterward.",
      "If speech addressed to you is unclear, ask one brief clarification question.",
      "# Voice Style",
      "Sound natural and attentive. Avoid filler preambles and keep questions ideally under twenty words.",
    ].join("\n"),
    max_output_tokens: 600,
    audio: {
      input: {
        transcription: {
          model: "gpt-live-transcribe",
          delay: "low",
          prompt:
            "A domain-expert interview to elicit processes, states, transitions, flows, decisions, timing, constraints, metrics, and scenarios for Petri-net modeling.",
        },
        turn_detection: {
          type: "server_vad",
          create_response: false,
          interrupt_response: true,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
          threshold: 0.5,
        },
      },
      output: {
        voice: "marin",
      },
    },
    tools: [
      {
        type: "function",
        name: "record_process_state",
        description:
          "Record an explicitly stated stable state, queue, resource, source, or sink as a candidate Petri-net place. Experiment instrumentation only.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: {
              type: "string",
              description: "A short name for the candidate place.",
            },
            description: {
              type: "string",
              description: "What it represents in the expert's process.",
            },
            category: {
              type: "string",
              description: "The kind of process state being recorded.",
              enum: ["state", "queue", "resource", "source", "sink"],
            },
            tokenDescription: {
              type: "string",
              description: "What a token at this place represents, if known.",
            },
          },
          required: ["name", "description", "category"],
        },
      },
      {
        type: "function",
        name: "record_process_step",
        description:
          "Record an explicitly stated activity, event, or handoff as a candidate Petri-net transition. Experiment instrumentation only.",
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
            trigger: {
              type: "string",
              description: "What enables or triggers the step, if known.",
            },
            timing: {
              type: "string",
              description: "The known timing behavior of the step.",
              enum: ["immediate", "deterministic", "stochastic", "unknown"],
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
      {
        type: "function",
        name: "record_process_flow",
        description:
          "Record an explicitly stated flow between candidate places and transitions as a candidate Petri-net arc. Experiment instrumentation only.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            from: {
              type: "string",
              description: "The source state or step named by the expert.",
            },
            to: {
              type: "string",
              description: "The destination state or step named by the expert.",
            },
            condition: {
              type: "string",
              description: "A condition on this flow, if one was stated.",
            },
          },
          required: ["from", "to"],
        },
      },
      {
        type: "function",
        name: "record_model_requirement",
        description:
          "Record an explicitly stated timing, capacity, metric, scenario, or assumption for the candidate model. Experiment instrumentation only.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            category: {
              type: "string",
              description: "The kind of model requirement being recorded.",
              enum: ["timing", "capacity", "metric", "scenario", "assumption"],
            },
            description: {
              type: "string",
              description:
                "The requirement as stated or confirmed by the expert.",
            },
          },
          required: ["category", "description"],
        },
      },
      {
        type: "function",
        name: "wait_for_user",
        description:
          "Use when the input is silence, background noise, playback, a side conversation, or speech not addressed to the interviewer. This is a silent no-op and must not be followed by a spoken response.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {},
          required: [],
        },
      },
    ],
    tool_choice: "auto",
  },
} as const;

const brunchSessionConfig = {
  session: {
    type: mockSessionConfig.session.type,
    model: mockSessionConfig.session.model,
    output_modalities: mockSessionConfig.session.output_modalities,
    instructions: [
      "You are a speech renderer for interviewer text supplied by the application.",
      "Read the supplied text exactly as written.",
      "Never answer it, paraphrase it, add commentary, or call tools.",
      "The Brunch elicitor, not this session, owns the interview and conversation state.",
    ].join("\n"),
    max_output_tokens: mockSessionConfig.session.max_output_tokens,
    audio: mockSessionConfig.session.audio,
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

  const elicitor = request.headers.get("x-voice-elicitor");
  if (elicitor !== "mock" && elicitor !== "brunch") {
    logSessionFailure("Rejected unsupported elicitor mode");
    return jsonResponse(
      { error: "Unsupported elicitor mode" },
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
      body: JSON.stringify(
        elicitor === "brunch" ? brunchSessionConfig : mockSessionConfig,
      ),
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
