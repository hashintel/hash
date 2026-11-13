/**
 * The HTTP protocol through which the bound browser claims, leases and
 * settles a call the server issued to it, under
 * `<agent>/<brunchRoutes.browserCalls>/<toolCallId>`.
 */

import * as v from "valibot";

import { vBrowserToolResult } from "./browser-tool-result";

/** Why a claimed call ended without a result: never started, refused as stale, or failed. */
const browserCallFailureDispositions = [
  "unstarted",
  "stale",
  "failed",
] as const;

export type BrowserCallFailureDisposition =
  (typeof browserCallFailureDispositions)[number];

/** What the server returns to the browser that claims an issued call. */
export interface BrowserCallClaim {
  /** One-use proof of the claim, sent back with every later request. */
  readonly capability: string;
  readonly binding: string;
  readonly toolName: string;
  readonly input: unknown;
  /** The document revision the model last saw; a change from any other is refused. */
  readonly expectedRevision?: string;
}

export const vBrowserCallLeaseBody = v.object({
  capability: v.string(),
  binding: v.string(),
});

const outcomeEntries = {
  ...vBrowserCallLeaseBody.entries,
  toolName: v.string(),
  canonicalInput: v.unknown(),
};

export const vBrowserCallResultBody = v.object({
  ...outcomeEntries,
  ...vBrowserToolResult.entries,
});

export const vBrowserCallFailureBody = v.object({
  ...outcomeEntries,
  disposition: v.picklist(browserCallFailureDispositions),
});

export type BrowserCallLeaseBody = v.InferOutput<typeof vBrowserCallLeaseBody>;
export type BrowserCallResultBody = v.InferOutput<
  typeof vBrowserCallResultBody
>;
export type BrowserCallFailureBody = v.InferOutput<
  typeof vBrowserCallFailureBody
>;

/** What the model is told of a call that never started: it had no effect. */
export const browserCallUnstartedRefusal =
  "Browser call was not started; no document operation was invoked.";

/** What the model is told of a call the browser refused because the document changed since the model's last view of the net. */
export const browserCallStaleRefusal =
  "Not started: the document changed by other means after your last view of the net. Read the net again, then make the change.";

/**
 * What the model is told of a started call that ended without a result: it
 * failed in the browser, its lease expired, or it was stopped. `unchanged`
 * says the call's tool cannot have changed the document when it fails.
 */
export const browserCallEndedWithoutResult = (
  cause: "failed" | "expired" | "stopped",
  unchanged: boolean,
): string => {
  switch (cause) {
    case "failed":
      return unchanged
        ? "The non-mutating browser call failed; the document is unchanged."
        : "The browser result failed; an attempted document effect is unknown.";
    case "expired":
      return unchanged
        ? "Browser call lease expired; the document is unchanged."
        : "Browser call lease expired; an attempted document effect is unknown.";
    case "stopped":
      return unchanged
        ? "Browser call stopped; the document is unchanged."
        : "Browser call stopped; an attempted document effect is unknown.";
  }
};
