import { describe, expect, test, vi } from "vitest";

import {
  assertArcEffects,
  verifyArcTransitionAttempt,
  type ArcMutationRequest,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  createJsonDocHandle,
  createPetrinaut,
} from "@hashintel/petrinaut-core";

import {
  preparedCrewReservationNet,
  dispatchCrewPlaceId,
  startFinalInspectionTransitionId,
} from "./prepared-crew-reservation-fixture";
import {
  createBrowserTransitionRecorder,
  createJoinedBrowserTransitionRecorder,
  observeBrowserDefinition,
} from "./transition-record";

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
  const recorder = createBrowserTransitionRecorder({
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
  test("joins issued canonical arguments to record carriage and refuses replacement of the basis envelope", () => {
    const fixture = setup();
    const joined = createJoinedBrowserTransitionRecorder({
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
      transitionRecord: {
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
    await verifyArcTransitionAttempt(attempt);
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
    await verifyArcTransitionAttempt(attempt);
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
    expect(() => assertArcEffects(attempt)).toThrow(/complete canonical diff/u);
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
    await verifyArcTransitionAttempt(attempt);
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
    await verifyArcTransitionAttempt(record.attempts[0]!);
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
    await verifyArcTransitionAttempt(attempt);
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
