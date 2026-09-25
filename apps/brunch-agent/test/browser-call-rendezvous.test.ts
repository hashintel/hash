import { afterEach, expect, it, vi } from "vitest";

import {
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
    incarnationId: "i",
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
    claimBrowserCall(call.instanceId, call.toolCallId, "wrong-incarnation"),
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
  expect(settleBrowserCall({ ...reply, binding: "wrong-incarnation" })).toBe(
    "not-issued",
  );
  expect(
    settleBrowserCall({ ...reply, canonicalInput: { name: "Other" } }),
  ).toBe("not-issued");
  expect(settleBrowserCall({ ...reply, toolName: "removePlace" })).toBe(
    "not-issued",
  );
  expect(failBrowserCall({ ...reply, binding: "wrong-incarnation" })).toBe(
    false,
  );
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
    binding: "document-incarnation",
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
    binding: "document-incarnation",
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
    binding: "document-incarnation",
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
    binding: "document-incarnation",
    verify,
  };
  const result = issueBrowserCall(call);
  const sibling = { ...call, toolCallId: crypto.randomUUID() };
  const siblingResult = issueBrowserCall(sibling);
  const rejection = expect(result).rejects.toThrow(/lease expired/);
  const siblingRejection =
    expect(siblingResult).rejects.toThrow(/lease expired/);
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
