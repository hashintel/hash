import {
  buildStructEvent,
  Emitter,
  gotEmitter,
  HttpProtocol,
  Tracker,
  tracker as createTracker,
} from "@snowplow/node-tracker";

import { getRequiredEnv } from "../util";

/**
 * Sets up snowplow telemetry for HASH usage. Disabled by default.
 * This tracking function simply sends an event when the platform starts to record usage metrics.
 */
export const setupTelemetry = (): [Emitter, Tracker] => {
  const protocol =
    process.env.HASH_TELEMETRY_HTTPS === "true"
      ? HttpProtocol.HTTPS
      : HttpProtocol.HTTP;

  const emitter = gotEmitter(
    getRequiredEnv("HASH_TELEMETRY_DESTINATION"), // Collector endpoint
    protocol, // Optionally specify a method - http is the default
  );

  const tracker = createTracker(
    [emitter],
    "usageTracker", // Namespace
    getRequiredEnv("HASH_TELEMETRY_APP_ID"), // App id
    true, // Base64 encoding, true by default
  );

  // This `srv` value means it's for server-side tracking (see https://docs.snowplowanalytics.com/docs/collecting-data/collecting-from-own-applications/snowplow-tracker-protocol/)
  tracker.setPlatform("srv");

  // We track an event to record usage of the platform
  tracker.track(
    buildStructEvent({
      category: "usage",
      action: "start-platform",
    }),
  );

  emitter.flush();

  return [emitter, tracker];
};
