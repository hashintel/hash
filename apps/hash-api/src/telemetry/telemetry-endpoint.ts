import { ipKeyGenerator, rateLimit } from "express-rate-limit";

import { frontendTrackEventNames } from "@local/hash-isomorphic-utils/telemetry/types";

import { telemetry } from "./telemetry";

import type {
  FrontendTelemetryEvent,
  FrontendTrackEventName,
  TelemetryRequest,
} from "@local/hash-isomorphic-utils/telemetry/types";
import type { Express, Request } from "express";

/** Upper bound on events accepted per request, to bound work per call. */
const MAX_EVENTS_PER_BATCH = 10;

const allowedTrackEvents = new Set<string>(frontendTrackEventNames);

/**
 * Per-IP rate limiter for the telemetry gateway. Anonymous callers are allowed
 * (page views happen before login) but throttled harder than authenticated
 * ones, since they are unauthenticated and cheap to spoof.
 */
const telemetryRateLimiter = rateLimit({
  windowMs: process.env.NODE_ENV === "test" ? 10 : 1000 * 60, // 1 minute
  limit: (req) => (req.user ? 240 : 30),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.ip ? ipKeyGenerator(req.ip) : "ip-unavailable"),
});

/**
 * Validate and narrow a single client-provided event. Returns `null` for any
 * event that is malformed or names a non-allowlisted track event, so the
 * browser can never inject arbitrary or server-only event names.
 *
 * Exported for unit testing.
 */
export const parseTelemetryEvent = (
  value: unknown,
): FrontendTelemetryEvent | null => {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const properties =
    typeof candidate.properties === "object" &&
    candidate.properties !== null &&
    !Array.isArray(candidate.properties)
      ? (candidate.properties as Record<string, unknown>)
      : undefined;

  if (candidate.type === "page") {
    if (typeof candidate.name !== "string" || candidate.name.length === 0) {
      return null;
    }
    return { type: "page", name: candidate.name, properties };
  }

  if (candidate.type === "track") {
    if (
      typeof candidate.name !== "string" ||
      !allowedTrackEvents.has(candidate.name)
    ) {
      return null;
    }
    return {
      type: "track",
      name: candidate.name as FrontendTrackEventName,
      properties,
    };
  }

  return null;
};

/**
 * Mounts the telemetry gateway at `POST /api/telemetry`.
 *
 * The browser reports allowlisted events here; the server stamps all trusted
 * fields (identity, IP, environment) and forwards to Rudderstack, flagging
 * everything as `frontendProvided`. Client-supplied identity/IP/environment are
 * never trusted.
 */
export const setupTelemetryHandler = (app: Express) => {
  app.post("/api/telemetry", telemetryRateLimiter, (req: Request, res) => {
    const body = req.body as Partial<TelemetryRequest> | undefined;

    if (!body || !Array.isArray(body.events)) {
      res.status(400).json({ error: "Request body must be { events: [...] }" });
      return;
    }

    if (body.events.length > MAX_EVENTS_PER_BATCH) {
      res
        .status(400)
        .json({ error: `Too many events (max ${MAX_EVENTS_PER_BATCH})` });
      return;
    }

    const events = body.events
      .map(parseTelemetryEvent)
      .filter((event): event is FrontendTelemetryEvent => event !== null);

    const anonymousId =
      typeof body.anonymousId === "string" ? body.anonymousId : undefined;

    telemetry.trackFromClient(req, { anonymousId, events });

    res.status(204).end();
  });
};
