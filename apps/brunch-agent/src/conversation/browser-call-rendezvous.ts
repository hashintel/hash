import { randomBytes } from "node:crypto";

import { browserToolMutatesDocument } from "@hashintel/brunch-agent-plugin-sdcpn";

import type { ClientToolResult } from "@hashintel/brunch-agent-transport-aisdk";

/** Process-local handoff for the documented single-owner Node deployment. No durable effects live here. */
const leaseMs = 25_000;
export const BROWSER_CALL_UNSTARTED_ERROR =
  "Browser call was not started; no document operation was invoked.";
export const BROWSER_CALL_STALE_ERROR =
  "Not started: the document changed by other means after your last view of the net. Read the net again, then make the change.";
interface IssuedCall {
  readonly binding: string;
  readonly input: string;
  readonly toolName: string;
  readonly capability: string;
  /** The document revision the model last saw; the browser refuses a change from any other. */
  readonly expectedRevision?: string;
  readonly result: PromiseWithResolvers<ClientToolResult>;
  readonly signal?: AbortSignal;
  deadline: number;
  claimed: boolean;
  finished: boolean;
  releaseAbort?: () => void;
  timer: ReturnType<typeof setTimeout>;
}
const calls = new Map<string, IssuedCall>();
/** The one model-facing error for a call that ends without a result: unstarted, unchanged, or unknown. */
const outcomeError = (
  entry: IssuedCall,
  cause: "unstarted" | "stale" | "failed" | "expired" | "stopped",
): Error => {
  if (cause === "stale") return new Error(BROWSER_CALL_STALE_ERROR);
  if (!entry.claimed || cause === "unstarted")
    return new Error(BROWSER_CALL_UNSTARTED_ERROR);
  const unchanged = !browserToolMutatesDocument(entry.toolName);
  switch (cause) {
    case "failed":
      return new Error(
        unchanged
          ? "The non-mutating browser call failed; the document is unchanged."
          : "The browser result failed; an attempted document effect is unknown.",
      );
    case "expired":
      return new Error(
        unchanged
          ? "Browser call lease expired; the document is unchanged."
          : "Browser call lease expired; an attempted document effect is unknown.",
      );
    case "stopped":
      return new Error(
        unchanged
          ? "Browser call stopped; the document is unchanged."
          : "Browser call stopped; an attempted document effect is unknown.",
      );
  }
};
const keyFor = (instanceId: string, toolCallId: string) =>
  JSON.stringify([instanceId, toolCallId]);

const retire = (key: string) => {
  const entry = calls.get(key);
  if (!entry) return;
  entry.finished = true;
  clearTimeout(entry.timer);
  entry.releaseAbort?.();
  calls.delete(key);
};

interface LeaseProof {
  readonly instanceId: string;
  readonly toolCallId: string;
  readonly capability: string;
  readonly binding: string;
}

/** The claimed, unexpired call this capability and binding hold. */
const leasedCall = (proof: LeaseProof): IssuedCall | undefined => {
  const entry = calls.get(keyFor(proof.instanceId, proof.toolCallId));
  return entry?.claimed &&
    !entry.finished &&
    entry.capability === proof.capability &&
    entry.binding === proof.binding &&
    Date.now() < entry.deadline
    ? entry
    : undefined;
};

/** A leased call that can still finish, for exactly the tool input it was issued with. */
const deliverableCall = (
  proof: LeaseProof & {
    readonly toolName: string;
    readonly canonicalInput: unknown;
  },
): IssuedCall | undefined => {
  const entry = leasedCall(proof);
  return entry &&
    !entry.signal?.aborted &&
    entry.toolName === proof.toolName &&
    entry.input === JSON.stringify(proof.canonicalInput)
    ? entry
    : undefined;
};

export const issueBrowserCall = (input: {
  readonly instanceId: string;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly binding: string;
  readonly canonicalInput: unknown;
  readonly expectedRevision?: string;
  readonly signal?: AbortSignal;
}): Promise<ClientToolResult> => {
  const key = keyFor(input.instanceId, input.toolCallId);
  if (calls.has(key)) throw new Error("Duplicate issued browser call.");
  if (input.signal?.aborted) throw new Error(BROWSER_CALL_UNSTARTED_ERROR);
  const result = Promise.withResolvers<ClientToolResult>();
  const entry: IssuedCall = {
    binding: input.binding,
    input: JSON.stringify(input.canonicalInput),
    toolName: input.toolName,
    capability: randomBytes(32).toString("base64url"),
    ...(input.expectedRevision === undefined
      ? {}
      : { expectedRevision: input.expectedRevision }),
    result,
    signal: input.signal,
    deadline: Date.now() + leaseMs,
    claimed: false,
    finished: false,
    releaseAbort: undefined,
    timer: undefined as unknown as ReturnType<typeof setTimeout>,
  };
  const expire = () => {
    if (entry.finished) return;
    if (Date.now() < entry.deadline) {
      entry.timer = setTimeout(expire, entry.deadline - Date.now());
      return;
    }
    finish(outcomeError(entry, "expired"));
  };
  const finish = (error: Error) => {
    if (entry.finished) return;
    retire(key);
    entry.result.reject(error);
  };
  entry.timer = setTimeout(expire, leaseMs);
  calls.set(key, entry);
  if (input.signal) {
    const onAbort = () => finish(outcomeError(entry, "stopped"));
    input.signal.addEventListener("abort", onAbort, { once: true });
    entry.releaseAbort = () =>
      input.signal?.removeEventListener("abort", onAbort);
  }
  return result.promise;
};

/** The caller's ownership middleware runs before these operations. The capability is one-use, not user authentication. */
export const claimBrowserCall = (
  instanceId: string,
  toolCallId: string,
  binding: string,
) => {
  const entry = calls.get(keyFor(instanceId, toolCallId));
  if (
    !entry ||
    entry.binding !== binding ||
    entry.claimed ||
    entry.finished ||
    Date.now() >= entry.deadline
  )
    return undefined;
  entry.claimed = true;
  return {
    capability: entry.capability,
    toolName: entry.toolName,
    input: JSON.parse(entry.input) as unknown,
    binding: entry.binding,
    ...(entry.expectedRevision === undefined
      ? {}
      : { expectedRevision: entry.expectedRevision }),
  };
};

export const renewBrowserCall = (input: LeaseProof): boolean => {
  const entry = leasedCall(input);
  if (!entry) return false;
  const deadline = Date.now() + leaseMs;
  entry.deadline = deadline;
  // A renewing browser is still working through this document's lane, so calls queued behind this one stay claimable.
  for (const queued of calls.values())
    if (!queued.claimed && queued.binding === entry.binding)
      queued.deadline = deadline;
  return true;
};

export const failBrowserCall = (input: {
  readonly instanceId: string;
  readonly toolCallId: string;
  readonly capability: string;
  readonly binding: string;
  readonly toolName: string;
  readonly canonicalInput: unknown;
  readonly disposition: "unstarted" | "stale" | "failed";
}): boolean => {
  const key = keyFor(input.instanceId, input.toolCallId);
  const entry = deliverableCall(input);
  if (!entry) return false;
  retire(key);
  entry.result.reject(outcomeError(entry, input.disposition));
  return true;
};

export const settleBrowserCall = (input: {
  readonly instanceId: string;
  readonly toolCallId: string;
  readonly capability: string;
  readonly binding: string;
  readonly toolName: string;
  readonly canonicalInput: unknown;
  readonly output: unknown;
  readonly metadata?: unknown;
}): "settled" | "not-issued" => {
  const key = keyFor(input.instanceId, input.toolCallId);
  const entry = deliverableCall(input);
  if (!entry) return "not-issued";
  retire(key);
  entry.result.resolve({
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    output: input.output,
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  });
  return "settled";
};
