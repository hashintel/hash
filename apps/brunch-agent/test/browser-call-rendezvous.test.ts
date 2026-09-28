import { afterEach, expect, it, vi } from "vitest";

import {
  BROWSER_CALL_STALE_ERROR,
  BROWSER_CALL_UNSTARTED_ERROR,
  claimBrowserCall,
  failBrowserCall,
  issueBrowserCall,
  renewBrowserCall,
  settleBrowserCall,
} from "../src/conversation/browser-call-rendezvous.ts";

afterEach(() => vi.useRealTimers());
const verify = async <Result>(result: Result): Promise<Result> => result;

it("accepts one issued, bound result and refuses unsolicited, forged, conflicting and duplicate results", async () => {
  const binding = JSON.stringify({
    conversationId: "c",
    documentId: "d",
  });
  const call = {
    instanceId: "owner",
    toolCallId: crypto.randomUUID(),
    toolName: "addPlace",
    canonicalInput: { name: "Queue" },
    binding,
    verify,
  };
  const result = issueBrowserCall(call);
  expect(claimBrowserCall("other", call.toolCallId, binding)).toBeUndefined();
  expect(claimBrowserCall("owner", "not-issued", binding)).toBeUndefined();
  expect(
    failBrowserCall({ ...call, capability: "forged", disposition: "failed" }),
  ).toBe(false);
  expect(
    claimBrowserCall(call.instanceId, call.toolCallId, "wrong-document"),
  ).toBeUndefined();
  const issued = claimBrowserCall(call.instanceId, call.toolCallId, binding);
  expect(issued?.input).toEqual(call.canonicalInput);
  expect(
    claimBrowserCall(call.instanceId, call.toolCallId, binding),
  ).toBeUndefined();
  const reply = {
    ...call,
    output: { applied: true },
    capability: issued!.capability,
    disposition: "failed" as const,
  };
  expect(settleBrowserCall({ ...reply, capability: "forged" })).toBe(
    "not-issued",
  );
  expect(settleBrowserCall({ ...reply, binding: "wrong-document" })).toBe(
    "not-issued",
  );
  expect(
    settleBrowserCall({ ...reply, canonicalInput: { name: "Other" } }),
  ).toBe("not-issued");
  expect(settleBrowserCall({ ...reply, toolName: "removePlace" })).toBe(
    "not-issued",
  );
  expect(failBrowserCall({ ...reply, binding: "wrong-document" })).toBe(false);
  expect(failBrowserCall({ ...reply, capability: "forged" })).toBe(false);
  expect(settleBrowserCall(reply)).toBe("settled");
  await expect(result).resolves.toMatchObject({
    toolCallId: call.toolCallId,
    toolName: call.toolName,
    output: reply.output,
  });
  expect(settleBrowserCall({ ...reply, output: { applied: false } })).toBe(
    "not-issued",
  );
  expect(renewBrowserCall(reply)).toBe(false);
  expect(failBrowserCall(reply)).toBe(false);
});

it("settles a claimed failure promptly, without fabricating a canonical output or poisoning an independent read", async () => {
  const mutation = {
    instanceId: "owner",
    toolCallId: crypto.randomUUID(),
    toolName: "addPlace",
    canonicalInput: {},
    binding: "same-document",
    verify,
  };
  const read = {
    ...mutation,
    toolCallId: crypto.randomUUID(),
    toolName: "getLatestNetDefinition",
  };
  const mutationResult = issueBrowserCall(mutation);
  const readResult = issueBrowserCall(read);
  const mutationRejection = expect(mutationResult).rejects.toThrow(/unknown/);
  const readRejection = expect(readResult).rejects.toThrow(/unchanged/);
  const mutationCapability = claimBrowserCall(
    mutation.instanceId,
    mutation.toolCallId,
    mutation.binding,
  )?.capability;
  const readCapability = claimBrowserCall(
    read.instanceId,
    read.toolCallId,
    read.binding,
  )?.capability;
  expect(
    failBrowserCall({
      ...mutation,
      capability: mutationCapability!,
      disposition: "failed",
    }),
  ).toBe(true);
  expect(
    failBrowserCall({
      ...read,
      capability: readCapability!,
      disposition: "failed",
    }),
  ).toBe(true);
  await Promise.all([mutationRejection, readRejection]);
  expect(
    settleBrowserCall({
      ...read,
      capability: readCapability!,
      output: {},
    }),
  ).toBe("not-issued");
});

it("settles a stopped call and refuses late results without replaying it", async () => {
  const controller = new AbortController();
  const call = {
    instanceId: "owner",
    toolCallId: crypto.randomUUID(),
    toolName: "addPlace",
    canonicalInput: {},
    binding: "document-binding",
    verify,
    signal: controller.signal,
  };
  const result = issueBrowserCall(call);
  const issued = claimBrowserCall(
    call.instanceId,
    call.toolCallId,
    call.binding,
  );
  controller.abort();
  await expect(result).rejects.toThrow(/unknown/);
  expect(
    settleBrowserCall({
      ...call,
      capability: issued!.capability,
      output: { applied: true },
    }),
  ).toBe("not-issued");
  expect(
    claimBrowserCall(call.instanceId, call.toolCallId, call.binding),
  ).toBeUndefined();
});

it("classifies an unclaimed Stop or expiry as unstarted, never as an attempted write", async () => {
  const controller = new AbortController();
  const call = {
    instanceId: "owner",
    toolCallId: crypto.randomUUID(),
    toolName: "addPlace",
    canonicalInput: {},
    binding: "document-binding",
    verify,
    signal: controller.signal,
  };
  const stopped = issueBrowserCall(call);
  const stoppedRejection = expect(stopped).rejects.toThrow(
    BROWSER_CALL_UNSTARTED_ERROR,
  );
  controller.abort();
  await stoppedRejection;
  expect(
    claimBrowserCall(call.instanceId, call.toolCallId, call.binding),
  ).toBeUndefined();

  vi.useFakeTimers();
  const expiredCall = {
    ...call,
    toolCallId: crypto.randomUUID(),
    signal: undefined,
  };
  const expired = issueBrowserCall(expiredCall);
  const expiredRejection = expect(expired).rejects.toThrow(
    BROWSER_CALL_UNSTARTED_ERROR,
  );
  await vi.advanceTimersByTimeAsync(25_001);
  await expiredRejection;
});

it("a bound negative result marks an explicitly skipped sibling as unstarted", async () => {
  const call = {
    instanceId: "owner",
    toolCallId: crypto.randomUUID(),
    toolName: "addPlace",
    canonicalInput: {},
    binding: "document-binding",
    verify,
  };
  const result = issueBrowserCall(call);
  const rejection = expect(result).rejects.toThrow(
    BROWSER_CALL_UNSTARTED_ERROR,
  );
  const issued = claimBrowserCall(
    call.instanceId,
    call.toolCallId,
    call.binding,
  );
  expect(
    failBrowserCall({
      ...call,
      capability: issued!.capability,
      disposition: "unstarted",
    }),
  ).toBe(true);
  await rejection;
  expect(
    failBrowserCall({
      ...call,
      capability: issued!.capability,
      disposition: "unstarted",
    }),
  ).toBe(false);
});

it("a silent browser must renew its bounded lease; silence is not an instantaneous disconnect", async () => {
  vi.useFakeTimers();
  const call = {
    instanceId: "owner",
    toolCallId: crypto.randomUUID(),
    toolName: "getLatestNetDefinition",
    canonicalInput: {},
    binding: "document-binding",
    verify,
  };
  const result = issueBrowserCall(call);
  const sibling = { ...call, toolCallId: crypto.randomUUID() };
  const siblingResult = issueBrowserCall(sibling);
  const rejection = expect(result).rejects.toThrow(
    "Browser call lease expired; the document is unchanged.",
  );
  const siblingRejection = expect(siblingResult).rejects.toThrow(
    "Browser call lease expired; the document is unchanged.",
  );
  const issued = claimBrowserCall(
    call.instanceId,
    call.toolCallId,
    call.binding,
  );
  const siblingIssued = claimBrowserCall(
    sibling.instanceId,
    sibling.toolCallId,
    sibling.binding,
  );
  await vi.advanceTimersByTimeAsync(25_001);
  await Promise.all([rejection, siblingRejection]);
  expect(renewBrowserCall({ ...call, capability: issued!.capability })).toBe(
    false,
  );
  expect(
    settleBrowserCall({
      ...sibling,
      capability: siblingIssued!.capability,
      output: {},
    }),
  ).toBe("not-issued");
});

it("a renewal keeps calls queued behind it on the same document claimable", async () => {
  vi.useFakeTimers();
  const running = {
    instanceId: "owner",
    toolCallId: crypto.randomUUID(),
    toolName: "applyAutoLayout",
    canonicalInput: {},
    binding: "document-binding",
    verify,
  };
  const queued = { ...running, toolCallId: crypto.randomUUID() };
  const otherDocument = {
    ...running,
    toolCallId: crypto.randomUUID(),
    binding: "other-document-binding",
  };
  void issueBrowserCall(running);
  const queuedResult = issueBrowserCall(queued);
  const otherDocumentRejection = expect(
    issueBrowserCall(otherDocument),
  ).rejects.toThrow(BROWSER_CALL_UNSTARTED_ERROR);
  const issued = claimBrowserCall(
    running.instanceId,
    running.toolCallId,
    running.binding,
  );
  await vi.advanceTimersByTimeAsync(20_000);
  expect(renewBrowserCall({ ...running, capability: issued!.capability })).toBe(
    true,
  );
  await vi.advanceTimersByTimeAsync(20_000);
  await otherDocumentRejection;
  const queuedIssued = claimBrowserCall(
    queued.instanceId,
    queued.toolCallId,
    queued.binding,
  );
  expect(queuedIssued?.input).toEqual({});
  expect(
    settleBrowserCall({
      ...queued,
      capability: queuedIssued!.capability,
      output: {},
    }),
  ).toBe("settled");
  await expect(queuedResult).resolves.toBeDefined();
});

it("classifies a claimed call that cannot change the document as unchanged when stopped or expired, and a claimed write as unknown", async () => {
  const controller = new AbortController();
  const base = {
    instanceId: "owner",
    canonicalInput: {},
    binding: "document-binding",
    verify,
  };
  const draft = {
    ...base,
    toolCallId: crypto.randomUUID(),
    toolName: "draft_petrinaut_experiment",
    signal: controller.signal,
  };
  const stoppedDraft = issueBrowserCall(draft);
  const stoppedRejection = expect(stoppedDraft).rejects.toThrow(
    "Browser call stopped; the document is unchanged.",
  );
  claimBrowserCall(draft.instanceId, draft.toolCallId, draft.binding);
  controller.abort();
  await stoppedRejection;

  vi.useFakeTimers();
  const write = {
    ...base,
    toolCallId: crypto.randomUUID(),
    toolName: "addPlace",
  };
  const expiredWrite = issueBrowserCall(write);
  const expiredRejection = expect(expiredWrite).rejects.toThrow(
    "Browser call lease expired; an attempted document effect is unknown.",
  );
  claimBrowserCall(write.instanceId, write.toolCallId, write.binding);
  await vi.advanceTimersByTimeAsync(25_001);
  await expiredRejection;
});

it("hands the browser the expected revision and reports a stale document without starting the call", async () => {
  const binding = JSON.stringify({ conversationId: "c", documentId: "d" });
  const call = {
    instanceId: "owner",
    toolCallId: crypto.randomUUID(),
    toolName: "addPlace",
    canonicalInput: { name: "Queue" },
    binding,
    expectedRevision: "r7",
  };
  const result = issueBrowserCall(call);
  const issued = claimBrowserCall(call.instanceId, call.toolCallId, binding);
  expect(issued?.expectedRevision).toBe("r7");
  expect(
    failBrowserCall({
      ...call,
      capability: issued!.capability,
      disposition: "stale",
    }),
  ).toBe(true);
  await expect(result).rejects.toThrow(BROWSER_CALL_STALE_ERROR);
});
