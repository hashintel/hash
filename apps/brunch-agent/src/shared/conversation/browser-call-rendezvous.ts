import { randomBytes } from "node:crypto";

import {
  browserCallEndedWithoutResult,
  browserCallStaleRefusal,
  browserCallUnstartedRefusal,
  browserToolFacts,
} from "@hashintel/brunch-agent";

import type {
  BrowserCallClaim,
  BrowserCallFailureBody,
  BrowserCallFailureDisposition,
  BrowserCallLeaseBody,
  BrowserCallResultBody,
  ClientToolResult,
} from "@hashintel/brunch-agent";

/**
 * Process-local handoff: an issued call lives only in this Brunch task's
 * memory. Brunch can run more than one task (a deploy overlaps old and new),
 * and a browser result that reaches another task finds no call until FE-2149
 * makes waiting turns durable. No durable effects live here.
 */
const leaseMs = 25_000;

/** A browser call that was never issued to, or never started by, the browser: it had no effect. */
export class BrowserCallNotStartedError extends Error {
  override name = "BrowserCallNotStartedError";
}
interface IssuedCall {
  /** The agent that issued the call; only that agent's mounts address it. */
  readonly agentName: string;
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
  cause: BrowserCallFailureDisposition | "expired" | "stopped",
): Error => {
  if (cause === "stale")
    return new BrowserCallNotStartedError(browserCallStaleRefusal);
  if (!entry.claimed || cause === "unstarted")
    return new BrowserCallNotStartedError(browserCallUnstartedRefusal);
  return new Error(
    browserCallEndedWithoutResult(
      cause,
      !browserToolFacts(entry.toolName).effectUnknownOnFailure,
    ),
  );
};
// Instance ids are unique only within an agent name, so the issuing agent is part of the key.
const keyFor = (agentName: string, instanceId: string, toolCallId: string) =>
  JSON.stringify([agentName, instanceId, toolCallId]);

const retire = (key: string) => {
  const entry = calls.get(key);
  if (!entry) return;
  entry.finished = true;
  clearTimeout(entry.timer);
  entry.releaseAbort?.();
  calls.delete(key);
};

/** The call a browser request addresses, by the agent mount it arrives on and its route parameters. */
interface CallAddress {
  readonly agentName: string;
  readonly instanceId: string;
  readonly toolCallId: string;
}

type LeaseProof = CallAddress & Readonly<BrowserCallLeaseBody>;

/** The claimed, unexpired call this capability and binding hold. */
const leasedCall = (proof: LeaseProof): IssuedCall | undefined => {
  const entry = calls.get(
    keyFor(proof.agentName, proof.instanceId, proof.toolCallId),
  );
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
  proof: LeaseProof &
    Readonly<Pick<BrowserCallResultBody, "toolName" | "canonicalInput">>,
): IssuedCall | undefined => {
  const entry = leasedCall(proof);
  return entry &&
    !entry.signal?.aborted &&
    entry.toolName === proof.toolName &&
    entry.input === JSON.stringify(proof.canonicalInput)
    ? entry
    : undefined;
};

export const issueBrowserCall = (
  input: CallAddress & {
    readonly toolName: string;
    readonly binding: string;
    readonly canonicalInput: unknown;
    readonly expectedRevision?: string;
    readonly signal?: AbortSignal;
  },
): Promise<ClientToolResult> => {
  const key = keyFor(input.agentName, input.instanceId, input.toolCallId);
  if (calls.has(key)) throw new Error("Duplicate issued browser call.");
  if (input.signal?.aborted)
    throw new BrowserCallNotStartedError(browserCallUnstartedRefusal);
  const result = Promise.withResolvers<ClientToolResult>();
  const entry: IssuedCall = {
    agentName: input.agentName,
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
  input: CallAddress & { readonly binding: string },
): BrowserCallClaim | undefined => {
  const entry = calls.get(
    keyFor(input.agentName, input.instanceId, input.toolCallId),
  );
  if (
    !entry ||
    entry.binding !== input.binding ||
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
    if (
      !queued.claimed &&
      queued.agentName === entry.agentName &&
      queued.binding === entry.binding
    )
      queued.deadline = deadline;
  return true;
};

export const failBrowserCall = (
  input: CallAddress & Readonly<BrowserCallFailureBody>,
): boolean => {
  const key = keyFor(input.agentName, input.instanceId, input.toolCallId);
  const entry = deliverableCall(input);
  if (!entry) return false;
  retire(key);
  entry.result.reject(outcomeError(entry, input.disposition));
  return true;
};

export const settleBrowserCall = (
  input: CallAddress & Readonly<BrowserCallResultBody>,
): "settled" | "not-issued" => {
  const key = keyFor(input.agentName, input.instanceId, input.toolCallId);
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
