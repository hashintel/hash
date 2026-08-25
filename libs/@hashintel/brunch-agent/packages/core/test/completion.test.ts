/**
 * The numbered invariants of `docs/specs/elicitation-completion.md`, one or more
 * tests each. Invariants 17–19 (deferral licensing) describe a session-control
 * computation over the report and are not implemented by `evaluateCompletion`;
 * invariant 19 is checked here only in that the report carries no persisted
 * status.
 */

import { describe, expect, test } from "vitest";

import {
  completionDemands,
  evaluateCompletion,
  precisionSatisfies,
  type CompletionDemands,
} from "../src/completion";
import { foldElicitedModel, type ElicitedModel } from "../src/elicited-model";
import {
  absence,
  assertionCapture,
  completeCaptures,
  fixturePluginDefinition,
  snapshotOf,
  value,
} from "./slot-fixtures";

import type { CaptureEnvelope } from "../src/capture-store";

const definition = fixturePluginDefinition();
const demands = completionDemands(definition);

const modelOf = (captures: readonly CaptureEnvelope[]): ElicitedModel =>
  foldElicitedModel(snapshotOf(captures), definition);

const without = (id: string): CaptureEnvelope[] =>
  completeCaptures().filter((capture) => capture.id !== id);

const replacing = (
  id: string,
  replacement: CaptureEnvelope,
): CaptureEnvelope[] =>
  completeCaptures().map((capture) =>
    capture.id === id ? replacement : capture,
  );

const diagnosticsOf = (captures: readonly CaptureEnvelope[]) =>
  evaluateCompletion(modelOf(captures), demands).failures.map((failure) => [
    failure.diagnostic,
    failure.nodeId ?? failure.kind,
    failure.slot,
  ]);

describe("shape of the answer (1–2)", () => {
  test("1. a complete model yields true with an empty, evidence-bearing report", () => {
    const report = evaluateCompletion(modelOf(completeCaptures()), demands);
    expect(report.complete).toBe(true);
    expect(report.failures).toEqual([]);
    expect(report.sliceNodeIds).toEqual([
      "objective:throughput",
      "step:stamp",
      "thing:press",
      "thing:widget",
    ]);
    // No lifecycle status, no persisted field: only the derived boolean.
    expect(Object.keys(report).sort()).toEqual([
      "complete",
      "failures",
      "outsideSlice",
      "pluginVersion",
      "revision",
      "sliceNodeIds",
    ]);
  });

  test("1. each failure names node, slot, requirement, actual state, diagnostic, and captures", () => {
    const report = evaluateCompletion(
      modelOf(
        replacing(
          "c-stamp-duration",
          assertionCapture(
            "c-stamp-duration",
            value("step", "stamp", "how long it takes", "range", {
              low: 2,
              high: 5,
            }),
          ),
        ),
      ),
      demands,
    );
    expect(report.complete).toBe(false);
    expect(report.failures).toHaveLength(1);
    const [failure] = report.failures;
    expect(failure).toMatchObject({
      diagnostic: "below-required-precision",
      nodeId: "step:stamp",
      kind: "step",
      slot: "how long it takes",
      requirement: "spread",
      actual: "range value under status explicit",
      captureIds: ["c-stamp-duration"],
    });
    expect(failure?.message).toContain(
      "Smallest delta: move it from range to spread",
    );
  });

  test("2. rows from another plugin version are refused with version-mismatch", () => {
    const foreign: CompletionDemands = {
      ...demands,
      pluginVersion: "fixture/2026-09-01.1",
    };
    const report = evaluateCompletion(modelOf(completeCaptures()), foreign);
    expect(report.complete).toBe(false);
    expect(report.failures.map((failure) => failure.diagnostic)).toEqual([
      "version-mismatch",
    ]);
    expect(report.pluginVersion).toBe("fixture/2026-09-01.1");
  });
});

describe("the rule (3–7)", () => {
  test("3. the floor is a count per kind and fails regardless of slot quality", () => {
    expect(
      diagnosticsOf(
        without("c-press-distinctions").filter((c) => c.id !== "c-press-count"),
      ),
    ).toEqual(
      expect.arrayContaining([["below-minimum-count", "thing", undefined]]),
    );
  });

  test("4. presence and slot quality are separate diagnostics", () => {
    const diagnostics = diagnosticsOf([
      ...without("c-press-distinctions").filter(
        (c) => c.id !== "c-press-count",
      ),
      assertionCapture(
        "c-widget-distinctions-2",
        value("thing", "widget", "distinctions", "named", "kinds"),
        { supersedes: "c-widget-distinctions" },
      ),
    ]);
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        ["below-minimum-count", "thing", undefined],
        ["below-required-precision", "thing:widget", "distinctions"],
      ]),
    );
  });

  test("5. nodes outside every objective's slice are recorded, not demanded", () => {
    const report = evaluateCompletion(
      modelOf([
        ...completeCaptures(),
        assertionCapture(
          "c-pack-actor",
          value("step", "pack", "who performs it", "named", "nobody"),
        ),
      ]),
      demands,
    );
    expect(report.complete).toBe(true);
    expect(report.outsideSlice).toEqual([
      {
        nodeId: "step:pack",
        kind: "step",
        open: [
          expect.objectContaining({
            diagnostic: "unaddressed",
            slot: "how long it takes",
          }),
        ],
      },
    ]);
  });

  test("6. an objective that depends on nothing in the model is unsupported, and dangling names are reported", () => {
    const report = evaluateCompletion(
      modelOf(
        replacing(
          "c-objective-deps",
          assertionCapture(
            "c-objective-deps",
            value(
              "objective",
              "throughput",
              "the nodes it depends on",
              "named",
              ["step:ship"],
            ),
          ),
        ),
      ),
      demands,
    );
    expect(report.failures).toEqual([
      expect.objectContaining({
        diagnostic: "unsupported-active-objective",
        nodeId: "objective:throughput",
        actual: "0 resolved, 1 naming no node in the model (step:ship)",
      }),
    ]);
    expect(report.sliceNodeIds).toEqual(["objective:throughput"]);
  });

  test("6. an objective with no dependency slot at all is unsupported; the floor does not substitute", () => {
    expect(diagnosticsOf(without("c-objective-deps"))).toEqual([
      [
        "unsupported-active-objective",
        "objective:throughput",
        "the nodes it depends on",
      ],
    ]);
  });

  test("7. an empty selection never passes", () => {
    expect(
      diagnosticsOf(
        replacing(
          "c-stamp-actor",
          assertionCapture(
            "c-stamp-actor",
            value("step", "stamp", "who performs it", "named", ""),
          ),
        ),
      ),
    ).toEqual([["no-selected-slot", "step:stamp", "who performs it"]]);
  });
});

describe("what counts as a value (8–14)", () => {
  test("8. an inferred value fails under the default accepted statuses, however precise", () => {
    const inferred = replacing(
      "c-stamp-duration",
      assertionCapture(
        "c-stamp-duration",
        value("step", "stamp", "how long it takes", "spread", { typical: 3 }),
        { status: "inferred" },
      ),
    );
    expect(diagnosticsOf(inferred)).toEqual([
      ["inadmissible-status", "step:stamp", "how long it takes"],
    ]);
    const permissive = completionDemands(definition, {
      acceptedStatuses: ["explicit", "inferred"],
    });
    expect(evaluateCompletion(modelOf(inferred), permissive).complete).toBe(
      true,
    );
  });

  test("9. a slot never mentioned fails as unaddressed", () => {
    expect(diagnosticsOf(without("c-stamp-duration"))).toEqual([
      ["unaddressed", "step:stamp", "how long it takes"],
    ]);
  });

  test("10. 'I don't know' and 'later' leave the slot open, with the pointer kept", () => {
    const report = evaluateCompletion(
      modelOf(
        replacing(
          "c-stamp-duration",
          assertionCapture(
            "c-stamp-duration",
            absence(
              "step",
              "stamp",
              "how long it takes",
              "deferred",
              "the MES log",
            ),
          ),
        ),
      ),
      demands,
    );
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]).toMatchObject({ diagnostic: "unaddressed" });
    expect(report.failures[0]?.message).toContain("pointing at the MES log");
  });

  test("11. an explicit absence passes only on a row that allows it", () => {
    expect(
      evaluateCompletion(modelOf(completeCaptures()), demands).complete,
    ).toBe(true); // widget "how many" is not-applicable on an allowing row
    expect(
      diagnosticsOf(
        replacing(
          "c-stamp-duration",
          assertionCapture(
            "c-stamp-duration",
            absence("step", "stamp", "how long it takes", "explicitly-absent"),
          ),
        ),
      ),
    ).toEqual([["unaccepted-absence", "step:stamp", "how long it takes"]]);
  });

  test("12. precision is checked against the row's word, not the number's look", () => {
    expect(precisionSatisfies("range", "spread")).toBe(false);
    expect(precisionSatisfies("number", "range")).toBe(false);
    expect(precisionSatisfies("spread", "range")).toBe(true);
    expect(precisionSatisfies("spread", "named")).toBe(true);
    expect(precisionSatisfies("spelled out", "number")).toBe(false);
    expect(precisionSatisfies("number", "spelled out")).toBe(false);
    expect(precisionSatisfies("spelled out", "spelled out")).toBe(true);
    expect(precisionSatisfies("spelled out", "named")).toBe(true);
  });

  test("13. conflict and divergence fail conservatively", () => {
    expect(
      diagnosticsOf([
        ...completeCaptures(),
        assertionCapture(
          "c-stamp-actor-alt",
          value("step", "stamp", "who performs it", "named", "the lead"),
          { entry: 9 },
        ),
      ]),
    ).toEqual([["open-conflict", "step:stamp", "who performs it"]]);
    expect(
      diagnosticsOf([
        ...without("c-stamp-actor"),
        assertionCapture(
          "c-manual",
          value("step", "stamp", "who performs it", "named", "the operator", {
            sourceRegime: "prescribed",
          }),
        ),
        assertionCapture(
          "c-floor",
          value(
            "step",
            "stamp",
            "who performs it",
            "named",
            "whoever is free",
            { sourceRegime: "practiced" },
          ),
          { entry: 2 },
        ),
      ]),
    ).toEqual([["unresolved-divergence", "step:stamp", "who performs it"]]);
  });

  test("14. a value whose support is not active and traceable fails as missing-evidence", () => {
    const model = modelOf(completeCaptures());
    const stamp = model.nodes.find((node) => node.id === "step:stamp")!;
    const tampered: ElicitedModel = {
      ...model,
      nodes: model.nodes.map((node) =>
        node.id === "step:stamp"
          ? {
              ...node,
              slots: {
                ...node.slots,
                "who performs it": {
                  ...stamp.slots["who performs it"]!,
                  evidenced: false,
                },
              },
            }
          : node,
      ),
    };
    expect(
      evaluateCompletion(tampered, demands).failures.map(
        (failure) => failure.diagnostic,
      ),
    ).toEqual(["missing-evidence"]);
  });
});

describe("what leaves the boolean untouched (15–16)", () => {
  test("15. the function is pure in (model, demands): the same inputs give the same report", () => {
    const model = modelOf(completeCaptures());
    expect(evaluateCompletion(model, demands)).toEqual(
      evaluateCompletion(model, demands),
    );
    expect(evaluateCompletion.length).toBe(2);
  });

  test("16. a later capture can make a complete document incomplete", () => {
    const before = evaluateCompletion(modelOf(completeCaptures()), demands);
    const after = evaluateCompletion(
      modelOf([
        ...completeCaptures(),
        assertionCapture(
          "c-widget-count-later",
          value("thing", "widget", "how many", "number", 40),
          { entry: 11 },
        ),
      ]),
      demands,
    );
    expect(before.complete).toBe(true);
    expect(after.complete).toBe(false);
    expect(after.failures[0]?.diagnostic).toBe("open-conflict");
  });
});
