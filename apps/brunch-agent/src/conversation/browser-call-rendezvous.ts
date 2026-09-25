import { randomBytes } from "node:crypto";

import { brunchTools } from "@hashintel/brunch-agent";

import type { ClientToolResult } from "@hashintel/brunch-agent-transport-aisdk";

/** Process-local handoff for the documented single-owner Node deployment. No durable effects live here. */
const leaseMs = 25_000;
export const BROWSER_CALL_UNSTARTED_ERROR =
  "Browser call was not started; no document operation was invoked.";
interface IssuedCall {
  readonly binding: string;
  readonly input: string;
  readonly toolName: string;
  readonly capability: string;
  readonly result: PromiseWithResolvers<ClientToolResult>;
  readonly signal?: AbortSignal;
  deadline: number;
  claimed: boolean;
  finished: boolean;
  releaseAbort?: () => void;
  timer: ReturnType<typeof setTimeout>;
}
const calls = new Map<string, IssuedCall>();
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
    finish(
      entry.claimed
        ? new Error(
            "Browser call lease expired; an attempted document effect is unknown.",
          )
        : new Error(BROWSER_CALL_UNSTARTED_ERROR),
    );
  };
  const finish = (error: Error) => {
    if (entry.finished) return;
    retire(key);
    entry.result.reject(error);
  };
  entry.timer = setTimeout(expire, leaseMs);
  calls.set(key, entry);
  if (input.signal) {
    const onAbort = () =>
      finish(
        entry.claimed
          ? new Error(
              "Browser call stopped; an attempted document effect is unknown.",
            )
          : new Error(BROWSER_CALL_UNSTARTED_ERROR),
      );
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
  };
};

export const renewBrowserCall = (input: LeaseProof): boolean => {
  const entry = leasedCall(input);
  if (!entry) return false;
  entry.deadline = Date.now() + leaseMs;
  return true;
};

export const failBrowserCall = (input: {
  readonly instanceId: string;
  readonly toolCallId: string;
  readonly capability: string;
  readonly binding: string;
  readonly toolName: string;
  readonly canonicalInput: unknown;
  readonly disposition: "unstarted" | "failed";
}): boolean => {
  const key = keyFor(input.instanceId, input.toolCallId);
  const entry = deliverableCall(input);
  if (!entry) return false;
  retire(key);
  const readOnly = [
    "getLatestNetDefinition",
    "getNetCompilationErrors",
    "readPetrinautDoc",
    "createExperiment",
    brunchTools.draftPetrinautExperiment,
  ].includes(entry.toolName);
  entry.result.reject(
    new Error(
      input.disposition === "unstarted"
        ? BROWSER_CALL_UNSTARTED_ERROR
        : readOnly
          ? "The non-mutating browser call failed; the document is unchanged."
          : "The browser result failed; an attempted document effect is unknown.",
    ),
  );
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
