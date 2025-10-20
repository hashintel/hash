import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import {
  buildStructEvent,
  newTracker,
  type Tracker,
} from "@snowplow/node-tracker";

/**
 * Sets up snowplow telemetry for HASH usage. Disabled by default.
 * This tracking function simply sends an event when the platform starts to record usage metrics.
 */
export const setupTelemetry = (): Tracker => {
  const protocol =
    process.env.HASH_TELEMETRY_HTTPS === "true" ? "https" : "http";

  const tracker = newTracker(
    {
      namespace: "usageTracker",
      appId: getRequiredEnv("HASH_TELEMETRY_APP_ID"),
      encodeBase64: true,
    },
    {
      endpoint: getRequiredEnv("HASH_TELEMETRY_DESTINATION"),
      protocol,
    },
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

  tracker.flush();

  return tracker;
};
