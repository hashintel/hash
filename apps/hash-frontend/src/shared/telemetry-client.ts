import { v4 as uuid } from "uuid";

import { apiOrigin } from "@local/hash-isomorphic-utils/environment";

import type { TelemetryRequest } from "@local/hash-isomorphic-utils/telemetry/types";

/**
 * Client for the telemetry gateway (`POST /api/telemetry`). The server stamps
 * all trusted fields (identity, IP, environment); the browser only supplies an
 * allowlisted event name, optional properties, and an anonymous id for
 * logged-out continuity. Telemetry must never break the app, so all failures
 * are swallowed.
 */
const ANONYMOUS_ID_STORAGE_KEY = "hash-telemetry-anonymous-id";

/** Generate/persist an opaque anonymous id for logged-out -> logged-in stitching. */
const getAnonymousId = (): string | undefined => {
  if (typeof window === "undefined") {
    return undefined;
  }
  try {
    let id = window.localStorage.getItem(ANONYMOUS_ID_STORAGE_KEY);
    if (!id) {
      id = uuid();
      window.localStorage.setItem(ANONYMOUS_ID_STORAGE_KEY, id);
    }
    return id;
  } catch {
    // localStorage can be unavailable (private mode, blocked cookies).
    return undefined;
  }
};

/** Send a batch of allowlisted events. Fire-and-forget; never throws. */
export const sendTelemetry = (
  payload: Omit<TelemetryRequest, "anonymousId">,
): void => {
  if (typeof window === "undefined" || payload.events.length === 0) {
    return;
  }

  const body: TelemetryRequest = {
    ...payload,
    anonymousId: getAnonymousId(),
  };

  void fetch(`${apiOrigin}/api/telemetry`, {
    method: "POST",
    credentials: "include",
    // `keepalive` lets the request outlive a page transition/unload.
    keepalive: true,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {
    // Swallow: telemetry failures must never surface to the user.
  });
};

/** Report a page view. */
export const trackPageView = (path: string): void => {
  sendTelemetry({ events: [{ type: "page", name: path }] });
};
