import { randomBytes } from "node:crypto";

import type { ClientToolResult } from "@hashintel/brunch-agent-transport-aisdk";

/** Process-local handoff for the documented single-owner Node deployment. No durable effects live here. */
const leaseMs = 25_000;
export const BROWSER_CALL_UNSTARTED_ERROR =
  "Browser call was not started; no document operation was invoked.";
const calls = new Map<
  string,
  {
    readonly binding: string;
    readonly input: string;
    readonly toolName: string;
    readonly capability: string;
    readonly result: PromiseWithResolvers<ClientToolResult>;
    readonly verify: (result: ClientToolResult) => Promise<ClientToolResult>;
    readonly signal?: AbortSignal;
    deadline: number;
    claimed: boolean;
    settling: boolean;
    finished: boolean;
    releaseAbort?: () => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
const keyFor = (instanceId: string, toolCallId: string) =>
  JSON.stringify([instanceId, toolCallId]);

export const issueBrowserCall = (input: {
  readonly instanceId: string;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly binding: string;
  readonly canonicalInput: unknown;
  readonly verify: (result: ClientToolResult) => Promise<ClientToolResult>;
  readonly signal?: AbortSignal;
}): Promise<ClientToolResult> => {
  const key = keyFor(input.instanceId, input.toolCallId);
  if (calls.has(key)) throw new Error("Duplicate issued browser call.");
  if (input.signal?.aborted) throw new Error(BROWSER_CALL_UNSTARTED_ERROR);
  const result = Promise.withResolvers<ClientToolResult>();
  const entry = {
    binding: input.binding,
    input: JSON.stringify(input.canonicalInput),
    toolName: input.toolName,
    capability: randomBytes(32).toString("base64url"),
    result,
    verify: input.verify,
    signal: input.signal,
    deadline: Date.now() + leaseMs,
    claimed: false,
    settling: false,
    finished: false,
    releaseAbort: undefined as (() => void) | undefined,
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
    entry.finished = true;
    clearTimeout(entry.timer);
    entry.releaseAbort?.();
    calls.delete(key);
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

export const renewBrowserCall = (input: {
  readonly instanceId: string;
  readonly toolCallId: string;
  readonly capability: string;
  readonly binding: string;
}): boolean => {
  const entry = calls.get(keyFor(input.instanceId, input.toolCallId));
  if (
    !entry?.claimed ||
    entry.finished ||
    entry.capability !== input.capability ||
    entry.binding !== input.binding ||
    Date.now() >= entry.deadline
  )
    return false;
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
  const entry = calls.get(key);
  if (
    !entry?.claimed ||
    entry.finished ||
    entry.settling ||
    entry.signal?.aborted ||
    entry.capability !== input.capability ||
    entry.binding !== input.binding ||
    Date.now() >= entry.deadline ||
    entry.toolName !== input.toolName ||
    entry.input !== JSON.stringify(input.canonicalInput)
  )
    return false;
  entry.finished = true;
  clearTimeout(entry.timer);
  entry.releaseAbort?.();
  calls.delete(key);
  const readOnly = [
    "getLatestNetDefinition",
    "getNetCompilationErrors",
    "readPetrinautDoc",
    "createExperiment",
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

export const settleBrowserCall = async (input: {
  readonly instanceId: string;
  readonly toolCallId: string;
  readonly capability: string;
  readonly binding: string;
  readonly toolName: string;
  readonly canonicalInput: unknown;
  readonly output: unknown;
  readonly metadata?: unknown;
}): Promise<"settled" | "invalid" | "not-issued"> => {
  const key = keyFor(input.instanceId, input.toolCallId);
  const entry = calls.get(key);
  if (
    !entry?.claimed ||
    entry.finished ||
    entry.settling ||
    entry.signal?.aborted ||
    entry.capability !== input.capability ||
    entry.binding !== input.binding ||
    Date.now() >= entry.deadline ||
    entry.toolName !== input.toolName ||
    entry.input !== JSON.stringify(input.canonicalInput)
  )
    return "not-issued";
  entry.settling = true;
  try {
    const verified = await entry.verify({
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      output: input.output,
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    });
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- The timer or Stop can settle this entry while verification is awaited.
    if (entry.finished || entry.signal?.aborted || Date.now() >= entry.deadline)
      return "not-issued";
    entry.finished = true;
    clearTimeout(entry.timer);
    entry.releaseAbort?.();
    calls.delete(key);
    entry.result.resolve(verified);
    return "settled";
  } catch (error) {
    if (!entry.finished) {
      entry.finished = true;
      clearTimeout(entry.timer);
      entry.releaseAbort?.();
      calls.delete(key);
      entry.result.reject(
        error instanceof Error ? error : new Error("Invalid browser result."),
      );
    }
    return "invalid";
  }
};
