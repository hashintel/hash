/**
 * Wire types for the telemetry gateway (`POST /api/telemetry`).
 *
 * The server is the only thing that talks to Rudderstack. The browser POSTs an
 * allowlisted set of events here; the server stamps all trusted fields (user
 * identity, IP, environment) and forwards them, flagging everything as
 * `frontendProvided`.
 */

/**
 * Telemetry environments. Events are stamped with this so they remain
 * queryable even within a single Rudderstack source (the separate per-env write
 * keys are the primary boundary).
 */
export type TelemetryEnvironment = "development" | "staging" | "production";

/**
 * Track-event names the browser is permitted to report. The server enforces
 * this allowlist, so the frontend can never name a server-only event (e.g.
 * `analysis_run`). Defined as a runtime constant so the server can validate
 * against it and the type stays in sync.
 */
export const frontendTrackEventNames = [
  "supply_chain_viewed",
  "supply_chain_interaction",
  "supply_chain_status_report_created",
  "supply_chain_error",
] as const;

export type FrontendTrackEventName = (typeof frontendTrackEventNames)[number];

/** A single event reported by the browser. */
export type FrontendTelemetryEvent =
  | {
      type: "page";
      /** Page path/name, e.g. `/supply-chain/product/abc`. */
      name: string;
      properties?: Record<string, unknown>;
    }
  | {
      type: "track";
      name: FrontendTrackEventName;
      properties?: Record<string, unknown>;
    };

/** Request body for `POST /api/telemetry`. */
export interface TelemetryRequest {
  /**
   * Opaque client-generated id used to correlate logged-out activity, and to
   * stitch it to a user once they authenticate.
   */
  anonymousId?: string;
  events: FrontendTelemetryEvent[];
}
