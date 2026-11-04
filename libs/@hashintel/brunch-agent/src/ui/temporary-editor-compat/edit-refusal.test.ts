import { describe, expect, test } from "vitest";

import { editRefusalFor } from "./edit-refusal";

import type { ReadOnlyReason } from "@hashintel/petrinaut/react";

const scenarioAndMetricEdits = [
  "addScenario",
  "updateScenario",
  "removeScenario",
  "addMetric",
  "updateMetric",
  "removeMetric",
] as const;

const editorStateReasons: readonly ReadOnlyReason[] = [
  { kind: "simulate-mode" },
  { kind: "actual-mode" },
  { kind: "simulation-active", state: "Running" },
  { kind: "simulation-active", state: "Paused" },
  { kind: "simulation-active", state: "Complete" },
];

describe("editRefusalFor", () => {
  test("allows every edit while the editor reports no reason", () => {
    for (const operation of [
      "addPlace",
      "applyAutoLayout",
      ...scenarioAndMetricEdits,
    ] as const) {
      expect(editRefusalFor(operation, null)).toBeNull();
    }
  });

  test("refuses every edit, scenario and metric edits included, on a read-only host", () => {
    const reason: ReadOnlyReason = { kind: "host-readonly" };
    for (const operation of [
      "addPlace",
      "removeArc",
      "applyAutoLayout",
      ...scenarioAndMetricEdits,
    ] as const) {
      expect(editRefusalFor(operation, reason)).toBe(reason);
    }
  });

  test("keeps scenario and metric edits available outside edit mode while refusing other edits", () => {
    for (const reason of editorStateReasons) {
      for (const operation of scenarioAndMetricEdits) {
        expect(editRefusalFor(operation, reason)).toBeNull();
      }
      expect(editRefusalFor("addPlace", reason)).toBe(reason);
      expect(editRefusalFor("updateTransition", reason)).toBe(reason);
      expect(editRefusalFor("applyAutoLayout", reason)).toBe(reason);
    }
  });
});
