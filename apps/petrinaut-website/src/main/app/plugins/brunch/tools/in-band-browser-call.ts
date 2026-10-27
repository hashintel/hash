import {
  agentOwnershipHeaders,
  browserExecutedToolInputSchemas,
  browserNetToolNames,
  brunchRoutes,
  canonicalContent,
} from "@hashintel/brunch-agent";

import type { ProcessAgentBinding } from "../conversation/use-process-agent-binding";
import type { FlueClient } from "@flue/sdk";
import type {
  BrowserCallClaim,
  BrowserCallFailureBody,
  BrowserCallFailureDisposition,
  BrowserCallLeaseBody,
  BrowserCallResultBody,
  ClientToolResultMetadata,
} from "@hashintel/brunch-agent";

/** A call the model made that the server issued to this browser. */
type IssuedCall = {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly input: unknown;
  readonly signal: AbortSignal;
};

/**
 * Decides, after the claim and before `prepareInput`, whether a call may
 * start. A refused call settles with the given output and never starts.
 */
export type InBandBrowserCallAdmission = (
  call: IssuedCall,
) => Promise<
  | { readonly admitted: true }
  | { readonly admitted: false; readonly output: unknown }
>;

export const BROWSER_CALL_STALE_MESSAGE =
  "The document changed by other means after the agent's last view of the net; the call was not started.";

/** The callback crosses the same single-owner HTTP process that is running the Flue tool. */
export const createInBandBrowserCalls = (input: {
  readonly client: Promise<FlueClient>;
  readonly principalKey: string;
  readonly binding: ProcessAgentBinding;
  readonly metadataFor: (
    toolCallId: string,
    output: unknown,
  ) => ClientToolResultMetadata | undefined;
  readonly prepareInput: (call: {
    toolCallId: string;
    toolName: string;
    input: unknown;
  }) => void;
  readonly admit?: InBandBrowserCallAdmission;
  /** Whether a change issued against `expected` may still run on the bound document. */
  readonly acceptsRevision: (expected: string) => boolean;
}) => {
  const claim = async (call: IssuedCall) => {
    const client = await input.client;
    const url = `${client.url}/${brunchRoutes.browserCalls}/${encodeURIComponent(call.toolCallId)}`;
    const boundClaimUrl = `${url}?binding=${encodeURIComponent(canonicalContent(input.binding))}`;
    const headers = agentOwnershipHeaders({
      principalKey: input.principalKey,
      conversationId: input.binding.conversationId,
    });
    const claimSignal = AbortSignal.any([
      call.signal,
      AbortSignal.timeout(6_000),
    ]);
    let issued: BrowserCallClaim | undefined;
    while (!claimSignal.aborted) {
      const response = await fetch(boundClaimUrl, {
        headers,
        signal: claimSignal,
      });
      if (response.ok) {
        issued = (await response.json()) as BrowserCallClaim;
        break;
      }
      if (response.status !== 404)
        throw new Error(`Browser call claim refused (${response.status}).`);
      await new Promise<void>((resolve, reject) => {
        let onAbort = () => {};
        const timeout = setTimeout(() => {
          claimSignal.removeEventListener("abort", onAbort);
          resolve();
        }, 75);
        onAbort = () => {
          clearTimeout(timeout);
          reject(claimSignal.reason);
        };
        claimSignal.addEventListener("abort", onAbort, { once: true });
      });
    }
    const inputSchema = browserExecutedToolInputSchemas[call.toolName];
    if (
      !issued ||
      issued.toolName !== call.toolName ||
      issued.binding !== canonicalContent(input.binding) ||
      !inputSchema
    )
      throw new Error("Browser call was not issued for this document.");
    // Both sides parse, so ids compare converted whether or not the server
    // that issued the call converts them.
    if (
      canonicalContent(inputSchema.parse(call.input)) !==
      canonicalContent(inputSchema.parse(issued.input))
    )
      throw new Error("Issued browser input does not match the admitted call.");
    const claimed = issued;
    const lease = setInterval(() => {
      if (call.signal.aborted) return;
      void fetch(`${url}/lease`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          capability: claimed.capability,
          binding: claimed.binding,
        } satisfies BrowserCallLeaseBody),
        signal: call.signal,
      }).catch(() => {});
    }, 5_000);
    call.signal.addEventListener("abort", () => clearInterval(lease), {
      once: true,
    });
    let stale = false;
    return {
      input: claimed.input,
      prepare: () => {
        // Checked at the start of this call's document-lane turn, after the
        // same proposal's earlier changes have settled.
        if (
          claimed.expectedRevision !== undefined &&
          !input.acceptsRevision(claimed.expectedRevision)
        ) {
          stale = true;
          throw new Error(BROWSER_CALL_STALE_MESSAGE);
        }
        input.prepareInput({
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          input: claimed.input,
        });
      },
      release: () => clearInterval(lease),
      fail: async (
        disposition: Exclude<BrowserCallFailureDisposition, "stale"> = "failed",
      ) => {
        clearInterval(lease);
        if (call.signal.aborted) return;
        const response = await fetch(`${url}/fail`, {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({
            capability: claimed.capability,
            binding: claimed.binding,
            toolName: call.toolName,
            canonicalInput: claimed.input,
            disposition: stale ? "stale" : disposition,
          } satisfies BrowserCallFailureBody),
          signal: call.signal,
        });
        if (!response.ok)
          throw new Error(
            `Browser call failure was not accepted (${response.status}).`,
          );
      },
      submit: async (output: unknown) => {
        clearInterval(lease);
        if (call.signal.aborted) return;
        const metadata = input.metadataFor(call.toolCallId, output);
        const response = await fetch(url, {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({
            capability: claimed.capability,
            binding: claimed.binding,
            toolName: call.toolName,
            canonicalInput: claimed.input,
            output,
            ...(metadata === undefined ? {} : { metadata }),
          } satisfies BrowserCallResultBody),
          signal: call.signal,
        });
        if (!response.ok)
          throw new Error(
            `Browser call result was not accepted (${response.status}); effect may be unknown.`,
          );
      },
    };
  };
  return {
    has: (toolName: string) => browserNetToolNames.has(toolName),
    claim,
    /**
     * Claim at this call's turn, run it under a renewed lease, then settle it.
     * A call is unstarted until `execute` is entered; after Stop nothing is reported.
     */
    run: async (
      call: IssuedCall,
      execute: (issuedInput: unknown) => Promise<unknown>,
    ) => {
      const issued = await claim(call);
      let started = false;
      try {
        if (call.signal.aborted) return;
        const admission = (await input.admit?.(call)) ?? { admitted: true };
        if (!admission.admitted) {
          await issued.submit(admission.output);
          return;
        }
        issued.prepare();
        started = true;
        await issued.submit(await execute(issued.input));
      } catch (error) {
        if (!call.signal.aborted)
          await issued.fail(started ? "failed" : "unstarted").catch(() => {});
        throw error;
      } finally {
        issued.release();
      }
    },
  };
};
