import * as v from "valibot";

import { canonicalContent } from "@hashintel/brunch-agent";

import { browserToolResultSchema } from "../../client-tools/browser-tool-result";
import { browserToolFacts } from "../../petrinaut/browser-executed-tools";
import {
  assertIssuedFor,
  BROWSER_CALL_STALE_MESSAGE,
  type InBandBrowserCallAdmission,
  type IssuedCall,
} from "../tools/in-band-browser-call";
import {
  type SuccessorConversation,
  successorEndpoints,
  successorHeaders,
} from "./successor-endpoints";

import type {
  BrowserCallClaim,
  BrowserCallClaimBody,
  BrowserCallFailureBody,
  BrowserCallFailureDisposition,
  BrowserCallLeaseBody,
  BrowserCallResultBody,
  BrowserContext,
  ClientToolResultMetadata,
} from "@hashintel/brunch-agent";

/** How long a claim keeps asking for a call the stream delivered before its issue commit. */
const claimWaitMs = 6_000;

/** How often a held call asks whether its claim still holds; the lease extends nothing. */
const leaseCheckMs = 5_000;

const browserCallStatuses = [
  "pending",
  "claimed",
  "finished",
  "failed",
  "settled",
  "failure-settled",
  "discarded",
  "expired",
  "stopped",
] as const;

const jsonValueSchema = browserToolResultSchema.entries.output;

/** A call's committed record as the server's browser-call routes show it. */
const successorBrowserCallSchema = v.object({
  toolCallId: v.string(),
  toolName: v.string(),
  input: v.unknown(),
  status: v.picklist(browserCallStatuses),
  /** What the browser posted; `null` before it posted a result. */
  output: jsonValueSchema,
  metadata: jsonValueSchema,
  expiresAt: v.number(),
  /** Whether a browser may still claim, start, renew or answer it. */
  admittable: v.boolean(),
});

const successorBrowserCallsSchema = v.object({
  calls: v.record(v.string(), successorBrowserCallSchema),
});

export type SuccessorBrowserCall = v.InferOutput<
  typeof successorBrowserCallSchema
>;

let pageClaimant: string | undefined;

/**
 * This page's claimant: one per page load. Session storage would keep it
 * across a reload, but a duplicated tab copies session storage, and two tabs
 * under one claimant would both start the same call.
 */
const claimantOfPage = () => {
  pageClaimant ??= crypto.randomUUID();
  return pageClaimant;
};

/** Waits `ms`, ending early when `signal` aborts. */
const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timeout = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });

/** A busy server's `Retry-After`, or a backoff from a quarter second up to four. */
const retryDelayMs = (attempt: number, response?: Response) => {
  const retryAfter = Number(response?.headers.get("retry-after"));
  return Number.isFinite(retryAfter) && retryAfter > 0
    ? retryAfter * 1_000
    : Math.min(250 * 2 ** attempt, 4_000);
};

const fetchOf =
  (conversation: SuccessorConversation): typeof globalThis.fetch =>
  (url, init) =>
    (conversation.fetch ?? globalThis.fetch)(url, init);

/**
 * Every browser call of the conversation, as the server committed it: what a
 * reloaded panel seeds its replay from. None for a conversation the server
 * doesn't have yet.
 */
export const readSuccessorBrowserCalls = async (
  conversation: SuccessorConversation,
  signal?: AbortSignal,
): Promise<readonly SuccessorBrowserCall[]> => {
  const { browserCalls } = await successorEndpoints(conversation);
  const response = await fetchOf(conversation)(browserCalls, {
    headers: successorHeaders(conversation),
    credentials: "include",
    cache: "no-store",
    ...(signal === undefined ? {} : { signal }),
  });
  if (response.status === 404) return [];
  if (!response.ok)
    throw new Error(
      `The server did not list the browser calls (${response.status}).`,
    );
  return Object.values(
    v.parse(successorBrowserCallsSchema, await response.json()).calls,
  );
};

/**
 * The page's side of browser calls on the durable agents server. A call
 * stays open on the server, in a tool task waiting for the browser, while a
 * tab claims it, starts it, runs it and posts its outcome to the
 * conversation's `browser-calls` routes, so the result reaches the turn that
 * asked for it.
 *
 * Every tab claims for itself, and a claim moves to the latest tab to claim
 * until its holder starts the call, immediately before running it. A tab
 * that loses a call to another, or is refused one another tab started, ends
 * quietly and lists it in `openInOtherTabs`. A call that ended (answered,
 * stopped, or past its 24-hour deadline) ends quietly as well: its outcome
 * reaches the panel from the server.
 */
export const createSuccessorBrowserCalls = (input: {
  readonly conversation: SuccessorConversation;
  readonly binding: BrowserContext["binding"];
  /** This tab's claimant; the page's own when omitted. */
  readonly claimant?: string;
  readonly metadataFor: (
    toolCallId: string,
    output: unknown,
  ) => ClientToolResultMetadata | undefined;
  readonly prepareInput: (call: {
    toolCallId: string;
    toolName: string;
    input: unknown;
  }) => void;
  readonly admit: InBandBrowserCallAdmission;
  /** Whether a change issued against `expected` may still run on the bound document. */
  readonly acceptsRevision: (expected: string) => boolean;
}) => {
  const request = fetchOf(input.conversation);
  const claimant = input.claimant ?? claimantOfPage();
  const headers = {
    ...successorHeaders(input.conversation),
    "content-type": "application/json",
  };
  const post = (url: string, body: unknown, signal: AbortSignal) =>
    request(url, {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify(body),
      signal,
    });

  let openInOtherTabs: ReadonlySet<string> = new Set();
  const listeners = new Set<() => void>();
  const noteOpenInOtherTab = (toolCallId: string) => {
    if (openInOtherTabs.has(toolCallId)) return;
    openInOtherTabs = new Set([...openInOtherTabs, toolCallId]);
    for (const listener of listeners) listener();
  };
  /** A call this tab lost is open in another tab while the server still admits it. */
  const noteLost = async (toolCallId: string) => {
    const records = await readSuccessorBrowserCalls(input.conversation).catch(
      () => [],
    );
    if (records.find((record) => record.toolCallId === toolCallId)?.admittable)
      noteOpenInOtherTab(toolCallId);
  };

  /** Claim `call` for this tab, asking again while the server has not issued it. */
  const claim = async (
    call: IssuedCall,
  ): Promise<
    | { readonly url: string; readonly claim: BrowserCallClaim }
    | "started-elsewhere"
    | "ended"
  > => {
    const url = `${(await successorEndpoints(input.conversation)).browserCalls}/${encodeURIComponent(call.toolCallId)}`;
    const signal = AbortSignal.any([
      call.signal,
      AbortSignal.timeout(claimWaitMs),
    ]);
    while (!signal.aborted) {
      // eslint-disable-next-line no-await-in-loop -- Each claim follows the last one's refusal.
      const response = await post(
        url,
        {
          claimant,
          binding: canonicalContent(input.binding),
        } satisfies BrowserCallClaimBody,
        signal,
      );
      if (response.ok) {
        // eslint-disable-next-line no-await-in-loop -- The loop ends here.
        const issued = (await response.json()) as BrowserCallClaim;
        assertIssuedFor(call, issued, input.binding);
        return { url, claim: issued };
      }
      if (response.status === 409) {
        // eslint-disable-next-line no-await-in-loop -- The loop ends here.
        const refusal: unknown = await response.json().catch(() => undefined);
        return typeof refusal === "object" &&
          refusal !== null &&
          "error" in refusal &&
          refusal.error === "started"
          ? "started-elsewhere"
          : "ended";
      }
      if (response.status !== 404)
        throw new Error(`Browser call claim refused (${response.status}).`);
      // eslint-disable-next-line no-await-in-loop -- Each claim follows the last one's refusal.
      await pause(75, signal);
    }
    throw new Error("Browser call was not issued for this document.");
  };

  /**
   * Post an outcome until the server answers it. A receipt for an outcome
   * already committed is an answer; so is 409, after which the call has
   * ended without this outcome.
   */
  const settle = async (url: string, body: unknown, signal: AbortSignal) => {
    for (let attempt = 0; !signal.aborted; attempt += 1) {
      let response: Response | undefined;
      try {
        // eslint-disable-next-line no-await-in-loop -- Each try follows the last one's failure.
        response = await post(url, body, signal);
      } catch {
        // Lost on the way: the outcome may have committed, which a retry's receipt says.
      }
      if (response?.ok || response?.status === 409) return;
      if (response !== undefined && response.status < 500)
        throw new Error(
          `Browser call outcome was not accepted (${response.status}).`,
        );
      // eslint-disable-next-line no-await-in-loop -- Each try follows the last one's failure.
      await pause(retryDelayMs(attempt, response), signal);
    }
  };

  return {
    // A tool an interactive card runs, such as the draft, is claimed there.
    has: (toolName: string) => browserToolFacts(toolName).automatic,
    /**
     * Claim at this call's turn, start it once admitted and still current,
     * run it, then settle it. After Stop nothing is reported.
     */
    run: async (
      call: IssuedCall,
      execute: (issuedInput: unknown) => Promise<unknown>,
    ) => {
      if (call.signal.aborted) return;
      const claimed = await claim(call);
      if (claimed === "started-elsewhere") {
        noteOpenInOtherTab(call.toolCallId);
        return;
      }
      if (claimed === "ended") return;
      const { url } = claimed;
      const { capability, binding, input: issuedInput } = claimed.claim;
      const { expectedRevision } = claimed.claim;
      const proof = { capability, binding } satisfies BrowserCallLeaseBody;
      const correlation = {
        ...proof,
        toolName: call.toolName,
        canonicalInput: issuedInput,
      };
      const lost = new AbortController();
      const signal = AbortSignal.any([call.signal, lost.signal]);
      const lease = setInterval(() => {
        void post(`${url}/lease`, proof, signal).then(
          (response) => {
            if (response.status === 409) lost.abort();
          },
          () => {},
        );
      }, leaseCheckMs);
      const submit = async (output: unknown) => {
        if (signal.aborted) return;
        const metadata = input.metadataFor(call.toolCallId, output);
        const result = v.parse(browserToolResultSchema, {
          output,
          ...(metadata === undefined ? {} : { metadata }),
        });
        await settle(
          `${url}/result`,
          { ...correlation, ...result } satisfies BrowserCallResultBody,
          signal,
        );
      };
      let disposition: BrowserCallFailureDisposition = "unstarted";
      const refuseIfStale = () => {
        if (
          expectedRevision !== undefined &&
          !input.acceptsRevision(expectedRevision)
        ) {
          disposition = "stale";
          throw new Error(BROWSER_CALL_STALE_MESSAGE);
        }
      };
      try {
        const admission = await input.admit({ ...call, signal });
        if (lost.signal.aborted) return await noteLost(call.toolCallId);
        if (!admission.admitted) return await submit(admission.output);
        // Every refusal comes before the start: the server reports a
        // started call's failure as one whose effect is unknown.
        refuseIfStale();
        input.prepareInput({
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          input: issuedInput,
        });
        if (signal.aborted) return;
        const started = await post(`${url}/start`, proof, signal);
        if (started.status === 409) return await noteLost(call.toolCallId);
        if (!started.ok)
          throw new Error(`Browser call start refused (${started.status}).`);
        // The document may have moved while the start was on its way.
        refuseIfStale();
        disposition = "failed";
        await submit(await execute(issuedInput));
      } catch (error) {
        if (!signal.aborted)
          await settle(
            `${url}/fail`,
            { ...correlation, disposition } satisfies BrowserCallFailureBody,
            signal,
          ).catch(() => {});
        throw error;
      } finally {
        clearInterval(lease);
      }
    },
    /** Calls this tab saw claimed or started by another tab, while they wait there. */
    openInOtherTabs: {
      getSnapshot: (): ReadonlySet<string> => openInOtherTabs,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
  };
};
