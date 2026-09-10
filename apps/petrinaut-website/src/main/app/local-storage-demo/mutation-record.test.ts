import { createHash } from "node:crypto";

import { describe, expect, test, vi } from "vitest";

import {
  assertMutationEffects,
  deriveMutationEffects,
  verifyMutationAttempt,
  type ArcMutationRequest,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  createJsonDocHandle,
  createPetrinaut,
} from "@hashintel/petrinaut-core";
import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import {
  createBrowserMutationRecorder,
  createJoinedBrowserMutationRecorder,
  observeBrowserDefinition,
  type MutationRecordContainedFailure,
} from "./mutation-record";
import {
  preparedCrewReservationNet,
  dispatchCrewPlaceId,
  startFinalInspectionTransitionId,
} from "./prepared-crew-reservation-fixture";

const setup = () => {
  const handle = createJsonDocHandle({
    id: "a3-test-document",
    initial: preparedCrewReservationNet,
    capabilities: { disabledExtensions: [] },
  });
  const instance = createPetrinaut({ document: handle });
  const binding = {
    documentId: handle.id,
    incarnationId: "a3-test-incarnation",
    conversationId: "a3-test-conversation",
  };
  const request: ArcMutationRequest = {
    toolName: "addArc",
    toolCallId: "a3-test-call",
    binding,
    requestedBaseHash: observeBrowserDefinition(handle).sha256,
    input: {
      transitionId: startFinalInspectionTransitionId,
      arcDirection: "input",
      placeId: dispatchCrewPlaceId,
      weight: 1,
      type: "standard",
    },
  };
  const recorder = createBrowserMutationRecorder({
    handle,
    binding,
    requestFor: () => request,
  });
  const execute = vi.fn(() => {
    instance.mutations.addArc(request.input);
    return { applied: true as const, title: "Added input arc" };
  });
  const run = () => recorder.executeMutation({ ...request, execute });
  return { handle, instance, request, recorder, execute, run };
};

describe("browser transition adapter (canonical handle, not a real browser witness)", () => {
  test("advances only by an explicitly cited earlier read for a distinct native weight correction", () => {
    const fixture = setup();
    const recorder = createJoinedBrowserMutationRecorder({
      handle: fixture.handle,
      binding: fixture.request.binding,
      construction: true,
    });
    const read = (toolCallId: string) => {
      recorder.mapClientToolInput({
        toolCallId,
        toolName: "getLatestNetDefinition",
        input: {},
      });
      recorder.clientToolResultMetadata({
        toolCallId,
        toolName: "getLatestNetDefinition",
        output: { definition: structuredClone(fixture.handle.doc()) },
      });
      return observeBrowserDefinition(fixture.handle).sha256;
    };
    const base = read("before-add");
    const first = {
      ...fixture.request.input,
      brunch: {
        basis: { kind: "absent", reason: "Synthetic mechanics" },
        observationToolCallId: "before-add",
        requestedBaseHash: base,
      },
    };
    const input = recorder.mapClientToolInput({
      toolCallId: "add",
      toolName: "addArc",
      input: first,
    });
    recorder.executeMutation({
      toolCallId: "add",
      toolName: "addArc",
      input: petrinautAiTools.addArc.inputSchema.parse(input),
      execute: fixture.execute,
    });
    const nextBase = read("before-correction");
    const correction = {
      transitionId: startFinalInspectionTransitionId,
      arcDirection: "input",
      placeId: dispatchCrewPlaceId,
      weight: 2,
      brunch: {
        basis: first.brunch.basis,
        observationToolCallId: "before-correction",
        requestedBaseHash: nextBase,
      },
    };
    const next = recorder.mapClientToolInput({
      toolCallId: "correct",
      toolName: "updateArcWeight",
      input: correction,
    });
    const execute = vi.fn(() => {
      fixture.instance.mutations.updateArcWeight(
        petrinautAiTools.updateArcWeight.inputSchema.parse(next),
      );
      return { applied: true as const, title: "Corrected weight" };
    });
    const call = {
      toolCallId: "correct",
      toolName: "updateArcWeight" as const,
      input: petrinautAiTools.updateArcWeight.inputSchema.parse(next),
      execute,
    };
    expect(recorder.executeMutation(call).applied).toBe(true);
    expect(recorder.executeMutation(call).applied).toBe(true);
    expect(execute).toHaveBeenCalledOnce();
    expect(recorder.records().map((record) => record.outcome)).toEqual([
      "applied",
      "applied",
    ]);
    expect(recorder.records()[1]?.attempts[0]?.effects.updated).toMatchObject([
      { kind: "updated", before: 1, after: 2 },
    ]);
    fixture.instance.dispose();
  });
  test("keeps mutation raw-base refusal even for object-key-order-equivalent definitions", () => {
    const fixture = setup();
    const observed = observeBrowserDefinition(fixture.handle);
    const reordered = Object.fromEntries(
      Object.entries(observed.definition).reverse(),
    );
    fixture.request.requestedBaseHash = createHash("sha256")
      .update(JSON.stringify(reordered))
      .digest("hex");
    expect(fixture.request.requestedBaseHash).not.toBe(observed.sha256);
    expect(fixture.run().applied).toBe(false);
    expect(fixture.recorder.records()[0]?.outcome).toBe("stale");
    expect(fixture.execute).not.toHaveBeenCalled();
    fixture.instance.dispose();
  });
  test("correlates a live read with an independently observed bound handle and refuses intervening edits", () => {
    const fixture = setup();
    const joined = createJoinedBrowserMutationRecorder({
      handle: fixture.handle,
      binding: fixture.request.binding,
      requestedBaseHash: fixture.request.requestedBaseHash,
    });
    const call = {
      toolName: "getLatestNetDefinition",
      toolCallId: "live-read",
      input: {},
    };
    joined.mapClientToolInput(call);
    const output = { definition: structuredClone(fixture.handle.doc()) };
    expect(joined.clientToolResultMetadata({ ...call, output })).toMatchObject({
      observation: {
        toolCallId: "live-read",
        binding: fixture.request.binding,
        observed: observeBrowserDefinition(fixture.handle),
      },
    });
    fixture.execute();
    expect(() => joined.clientToolResultMetadata({ ...call, output })).toThrow(
      /differs/iu,
    );
    expect(() =>
      joined.clientToolResultMetadata({
        ...call,
        toolCallId: "unknown",
        output,
      }),
    ).toThrow(/issued/iu);
    fixture.instance.dispose();
  });
  test("joins issued canonical arguments to record carriage and refuses replacement of the basis envelope", () => {
    const fixture = setup();
    const joined = createJoinedBrowserMutationRecorder({
      handle: fixture.handle,
      binding: fixture.request.binding,
      requestedBaseHash: fixture.request.requestedBaseHash,
    });
    const brunch = {
      basis: { kind: "absent", reason: "Labelled mechanical fixture" },
      requestedBaseHash: fixture.request.requestedBaseHash,
    };
    const call = {
      toolName: "addArc",
      toolCallId: fixture.request.toolCallId,
      input: { ...fixture.request.input, weight: "1", brunch },
    };
    expect(joined.mapClientToolInput(call)).toEqual(fixture.request.input);
    expect(() =>
      joined.mapClientToolInput({
        ...call,
        input: {
          ...call.input,
          brunch: {
            ...brunch,
            basis: { kind: "absent", reason: "Changed basis" },
          },
        },
      }),
    ).toThrow(/conflicting/iu);
    const output = joined.executeMutation({
      ...fixture.request,
      execute: fixture.execute,
    });
    const metadata = joined.clientToolResultMetadata({
      toolCallId: fixture.request.toolCallId,
      toolName: "addArc",
      output,
    });
    expect(metadata).toMatchObject({
      mutationRecord: {
        outcome: "applied",
        attempts: [{ request: fixture.request }],
      },
    });
    joined.executeMutation({ ...fixture.request, execute: fixture.execute });
    expect(fixture.execute).toHaveBeenCalledTimes(1);
    fixture.instance.dispose();
  });
  test("observes the pre-apply hash independently of the request", async () => {
    const fixture = setup();
    fixture.request.requestedBaseHash = "0".repeat(64);
    expect(fixture.run()).toMatchObject({ applied: false });
    expect(fixture.execute).not.toHaveBeenCalled();
    const attempt = fixture.recorder.records()[0]!.attempts[0]!;
    expect(attempt.pre.sha256).not.toBe(fixture.request.requestedBaseHash);
    expect(attempt.outcome).toBe("stale");
    await verifyMutationAttempt(attempt);
    fixture.instance.dispose();
  });

  test("observes a hand edit after request preparation rather than using the earlier snapshot", () => {
    const fixture = setup();
    const requestedHash = fixture.request.requestedBaseHash;
    fixture.instance.mutations.updatePlace({
      placeId: dispatchCrewPlaceId,
      update: { name: "EditedCrew" },
    });
    expect(fixture.run()).toMatchObject({ applied: false });
    expect(fixture.execute).not.toHaveBeenCalled();
    const attempt = fixture.recorder.records()[0]!.attempts[0]!;
    expect(attempt.outcome).toBe("stale");
    expect(attempt.pre.sha256).not.toBe(requestedHash);
    expect(
      attempt.pre.definition.places.find(
        (place) => place.id === dispatchCrewPlaceId,
      )?.name,
    ).toBe("EditedCrew");
    fixture.instance.dispose();
  });

  test("derives disjoint created, updated, deleted, derived sets from pre and post definitions", async () => {
    const fixture = setup();
    fixture.run();
    const attempt = fixture.recorder.records()[0]!.attempts[0]!;
    expect(attempt.outcome).toBe("applied");
    expect(attempt.effects).toEqual({
      created: [
        {
          path: "/transitions/0/inputArcs/1",
          kind: "created",
          after: { placeId: dispatchCrewPlaceId, type: "standard", weight: 1 },
        },
      ],
      updated: [],
      deleted: [],
      derived: [],
    });
    await verifyMutationAttempt(attempt);
    fixture.run();
    expect(fixture.execute).toHaveBeenCalledTimes(1);
    expect(fixture.recorder.records()[0]?.attempts).toHaveLength(2);
    fixture.instance.dispose();
  });

  test("refuses a record whose effects do not account for the diff", () => {
    const fixture = setup();
    fixture.run();
    const attempt = fixture.recorder.records()[0]!.attempts[0]!;
    attempt.effects.created = [];
    expect(() => assertMutationEffects(attempt)).toThrow(
      /complete canonical diff/u,
    );
    fixture.instance.dispose();
  });

  test("marks conflicting duplicate browser outcomes unknown and retains both deliveries", async () => {
    const fixture = setup();
    fixture.run();
    const attempt = fixture.recorder.records()[0]!.attempts[0]!;
    const conflict = {
      ...attempt,
      post: attempt.pre,
      outcome: "no-op" as const,
      effects: { created: [], updated: [], deleted: [], derived: [] },
    };
    const record = await fixture.recorder.acceptDelivery(conflict);
    expect(record.outcome).toBe("unknown");
    expect(record.attempts).toHaveLength(2);
    expect(fixture.execute).toHaveBeenCalledTimes(1);
    expect(() => fixture.run()).toThrow(/conflicting/u);
    fixture.instance.dispose();
  });

  test("observes no-op honesty despite a callback returning applied true", async () => {
    const fixture = setup();
    fixture.instance.mutations.addArc(fixture.request.input);
    fixture.request.requestedBaseHash = observeBrowserDefinition(
      fixture.handle,
    ).sha256;
    expect(fixture.run()).toMatchObject({ applied: false });
    expect(fixture.run()).toMatchObject({ applied: false });
    const attempt = fixture.recorder.records()[0]!.attempts[0]!;
    expect(attempt.outcome).toBe("no-op");
    await verifyMutationAttempt(attempt);
    fixture.instance.dispose();
  });

  test("retains a failing callback as a non-causal attempt and never retries it", async () => {
    const fixture = setup();
    fixture.request.input = { ...fixture.request.input, placeId: "missing" };
    expect(() => fixture.run()).toThrow(/missing/u);
    expect(() => fixture.run()).toThrow(/missing/u);
    expect(fixture.execute).toHaveBeenCalledTimes(1);
    const record = fixture.recorder.records()[0]!;
    expect(record.outcome).toBe("failed");
    expect(record.attempts).toHaveLength(2);
    await verifyMutationAttempt(record.attempts[0]!);
    fixture.instance.dispose();
  });

  test("does not admit outcomes for unissued calls or allow mutation during verification", async () => {
    const fixture = setup();
    fixture.run();
    const attempt = fixture.recorder.records()[0]!.attempts[0]!;
    const unissued = structuredClone(attempt);
    unissued.request.toolCallId = "unissued";
    await expect(fixture.recorder.acceptDelivery(unissued)).rejects.toThrow(
      /issued canonical request/u,
    );
    const accepted = fixture.recorder.acceptDelivery(attempt);
    attempt.post!.definition.transitions[0]!.inputArcs[0]!.weight = 99;
    const record = await accepted;
    expect(record.outcome).toBe("applied");
    expect(
      record.attempts[1]?.post?.definition.transitions[0]?.inputArcs[0]?.weight,
    ).toBe(1);
    fixture.instance.dispose();
  });

  test("retains unknown when effect derivation fails after the mutation", () => {
    const fixture = setup();
    let derivations = 0;
    const onContainedFailure =
      vi.fn<(failure: MutationRecordContainedFailure) => void>();
    const recorder = createBrowserMutationRecorder({
      handle: fixture.handle,
      binding: fixture.request.binding,
      requestFor: () => fixture.request,
      deriveEffects: (...input) => {
        derivations += 1;
        if (derivations > 1) throw new Error("Synthetic derivation failure");
        return deriveMutationEffects(...input);
      },
      onContainedFailure,
    });
    expect(() =>
      recorder.executeMutation({
        ...fixture.request,
        execute: fixture.execute,
      }),
    ).toThrow(/synthetic derivation failure/iu);
    const [record] = recorder.records();
    expect(record?.outcome).toBe("unknown");
    expect(record?.attempts[0]?.outcome).toBe("unknown");
    expect(record?.attempts[0]?.error).toMatch(/effect derivation failed/iu);
    // The contained second failure is reported to the host, once, with its kind.
    expect(onContainedFailure).toHaveBeenCalledOnce();
    expect(onContainedFailure).toHaveBeenCalledWith({
      toolCallId: fixture.request.toolCallId,
      kind: "effect-derivation",
      error: expect.objectContaining({
        message: "Synthetic derivation failure",
      }) as unknown,
    });
    fixture.instance.dispose();
  });

  test("retains unknown rather than inventing a post hash when the document becomes unavailable", async () => {
    const fixture = setup();
    expect(() =>
      fixture.recorder.executeMutation({
        ...fixture.request,
        execute: () => {
          fixture.execute();
          vi.spyOn(fixture.handle, "doc").mockReturnValue(undefined);
          return { applied: true, title: "Added input arc" };
        },
      }),
    ).toThrow(/unavailable/u);
    const attempt = fixture.recorder.records()[0]!.attempts[0]!;
    expect(attempt.outcome).toBe("unknown");
    expect(attempt.post).toBeUndefined();
    await verifyMutationAttempt(attempt);
    expect(() => fixture.run()).toThrow(/unknown/u);
    fixture.instance.dispose();
  });

  test("keeps the original binding when the caller mutates its configuration", () => {
    const fixture = setup();
    fixture.request.binding.incarnationId = "replacement-incarnation";
    expect(() => fixture.run()).toThrow(/incarnation/u);
    expect(fixture.execute).not.toHaveBeenCalled();
    expect(fixture.recorder.records()[0]?.outcome).toBe("failed");
    fixture.instance.dispose();
  });

  test("does not accept an invented observation hash", async () => {
    const fixture = setup();
    fixture.run();
    const attempt = fixture.recorder.records()[0]!.attempts[0]!;
    attempt.post!.sha256 = "0".repeat(64);
    await expect(fixture.recorder.acceptDelivery(attempt)).rejects.toThrow(
      /hash/u,
    );
    expect(fixture.recorder.records()[0]?.attempts).toHaveLength(1);
    fixture.instance.dispose();
  });
});
