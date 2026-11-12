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
