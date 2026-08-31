import { describe, expect, test } from "vitest";

import {
  findNode,
  foldElicitedModel,
} from "../src/interpretation/elicited-model";
import {
  absence,
  assertionCapture,
  completeCaptures,
  fixturePluginDefinition,
  snapshotOf,
  value,
} from "./slot-fixtures";

import type { JsonValue } from "../src/json-value";

const definition = fixturePluginDefinition();

describe("the fold reads only active captures", () => {
  test("groups assertions into nodes and slots keyed by kind:node", () => {
    const model = foldElicitedModel(snapshotOf(completeCaptures()), definition);
    expect(model.pluginVersion).toBe("fixture/2026-08-25.1");
    expect(model.nodes.map((node) => node.id)).toEqual([
      "objective:throughput",
      "step:stamp",
      "thing:press",
      "thing:widget",
    ]);
    expect(findNode(model, "step:stamp")?.slots["who performs it"]).toEqual({
      state: "value",
      value: "the press operator",
      precision: "named",
      status: "explicit",
      evidenced: true,
      captureIds: ["c-stamp-actor"],
    });
    expect(findNode(model, "thing:widget")?.slots["how many"]).toEqual({
      state: "absence",
      absence: "not-applicable",
      status: "explicit",
      evidenced: true,
      captureIds: ["c-widget-count"],
    });
    expect(model.unmapped).toEqual([]);
  });

  test("a superseding capture replaces its target; a retracted capture disappears", () => {
    const captures = [
      ...completeCaptures(),
      assertionCapture(
        "c-stamp-actor-2",
        value("step", "stamp", "who performs it", "named", "the line lead"),
        { supersedes: "c-stamp-actor", entry: 7 },
      ),
    ];
    const model = foldElicitedModel(
      snapshotOf(
        captures,
        [],
        [
          {
            type: "retraction",
            id: "r-1",
            captureId: "c-press-count",
            evidence: [
              {
                excerpt: "forget the press count",
                pointer: { sessionId: "session-1", entryStart: 8, entryEnd: 8 },
                source: "user",
              },
            ],
          },
        ],
      ),
      definition,
    );
    const actor = findNode(model, "step:stamp")?.slots["who performs it"];
    expect(actor?.state).toBe("value");
    expect(actor?.captureIds).toEqual(["c-stamp-actor-2"]);
    expect(findNode(model, "thing:press")?.slots["how many"]).toBeUndefined();
    expect(model.activeCaptureIds.has("c-stamp-actor")).toBe(false);
    expect(model.activeCaptureIds.has("c-press-count")).toBe(false);
  });

  test("never interprets: an unreadable payload and an envelope-level absence are unmapped", () => {
    const stray = {
      ...assertionCapture(
        "c-stray",
        value("thing", "widget", "colour", "named", "blue"),
      ),
    };
    const envelopeAbsence = assertionCapture(
      "c-envelope-absence",
      value("thing", "widget", "distinctions", "named", "x"),
    );
    const model = foldElicitedModel(
      snapshotOf([
        stray,
        {
          ...envelopeAbsence,
          content: { absence: "unknown-to-user" },
          dedupKey: "manual-key",
        },
        {
          ...assertionCapture(
            "c-free",
            value("thing", "widget", "how many", "range", 1),
          ),
          content: { value: { free: "text" } as JsonValue },
          dedupKey: "manual-key-2",
        },
      ]),
      definition,
    );
    expect(model.nodes).toEqual([]);
    expect(model.unmapped.map((entry) => entry.captureId).sort()).toEqual([
      "c-envelope-absence",
      "c-free",
      "c-stray",
    ]);
    expect(
      model.unmapped.find((entry) => entry.captureId === "c-stray")?.reason,
    ).toMatch(/not a `Must know` row/u);
  });
});

describe("competing readings", () => {
  test("two different active values on one slot are a conflict, and an open conflict issue pins one", () => {
    const captures = [
      assertionCapture(
        "c-a",
        value("step", "stamp", "who performs it", "named", "Ann"),
      ),
      assertionCapture(
        "c-b",
        value("step", "stamp", "who performs it", "named", "Bob"),
        {
          entry: 2,
        },
      ),
      assertionCapture(
        "c-c",
        value("thing", "widget", "distinctions", "spelled out", ["x"]),
      ),
      assertionCapture(
        "c-d",
        value("thing", "widget", "distinctions", "spelled out", ["x"]),
        { entry: 3 },
      ),
    ];
    const model = foldElicitedModel(
      snapshotOf(captures, [
        {
          id: "issue-1",
          type: "conflicting",
          origin: { type: "harness" },
          references: ["c-c", "c-d"],
          canDefault: false,
        },
      ]),
      definition,
    );
    expect(findNode(model, "step:stamp")?.slots["who performs it"]?.state).toBe(
      "conflict",
    );
    // Identical readings would merge, but the open issue keeps the slot in conflict.
    expect(findNode(model, "thing:widget")?.slots.distinctions?.state).toBe(
      "conflict",
    );
  });

  test("identical readings merge into one value citing every capture", () => {
    const captures = [
      assertionCapture(
        "c-a",
        value("step", "stamp", "who performs it", "named", "Ann"),
      ),
      assertionCapture(
        "c-b",
        value("step", "stamp", "who performs it", "named", "Ann"),
        {
          entry: 2,
          status: "inferred",
        },
      ),
    ];
    const slot = findNode(
      foldElicitedModel(snapshotOf(captures), definition),
      "step:stamp",
    )?.slots["who performs it"];
    expect(slot).toMatchObject({
      state: "value",
      status: "explicit",
      captureIds: ["c-a", "c-b"],
    });
  });

  test("a prescribed and a practiced reading that differ are a divergence, not a conflict", () => {
    const captures = [
      assertionCapture(
        "c-manual",
        value("step", "stamp", "who performs it", "named", "the operator", {
          sourceRegime: "prescribed",
        }),
      ),
      assertionCapture(
        "c-floor",
        value("step", "stamp", "who performs it", "named", "whoever is free", {
          sourceRegime: "practiced",
        }),
        { entry: 2 },
      ),
    ];
    const slot = findNode(
      foldElicitedModel(snapshotOf(captures), definition),
      "step:stamp",
    )?.slots["who performs it"];
    expect(slot?.state).toBe("divergence");
    expect(slot?.captureIds).toEqual(["c-manual", "c-floor"]);
  });

  test("an absence is one reading like any other", () => {
    const captures = [
      assertionCapture(
        "c-a",
        absence(
          "step",
          "stamp",
          "how long it takes",
          "unknown-to-user",
          "the MES log",
        ),
      ),
    ];
    expect(
      findNode(
        foldElicitedModel(snapshotOf(captures), definition),
        "step:stamp",
      )?.slots["how long it takes"],
    ).toEqual({
      state: "absence",
      absence: "unknown-to-user",
      pointer: "the MES log",
      status: "explicit",
      evidenced: true,
      captureIds: ["c-a"],
    });
  });
});

describe("revision", () => {
  test("is stable for the same active set and changes when it changes", () => {
    const base = completeCaptures();
    const first = foldElicitedModel(snapshotOf(base), definition).revision;
    const again = foldElicitedModel(
      snapshotOf([...base].reverse()),
      definition,
    ).revision;
    const grown = foldElicitedModel(
      snapshotOf([
        ...base,
        assertionCapture(
          "c-extra",
          value("step", "pack", "who performs it", "named", "nobody"),
        ),
      ]),
      definition,
    ).revision;
    expect(again).toBe(first);
    expect(grown).not.toBe(first);
  });
});
