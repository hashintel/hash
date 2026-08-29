import { describe, expect, test } from "vitest";

import { completionDemands, evaluateCompletion } from "../src/completion";
import {
  buildCompletionCueSignal,
  buildSweepList,
  completionProtocolInstructionFragments,
} from "../src/cue";
import { foldElicitedModel } from "../src/elicited-model";
import {
  assertionCapture,
  completeCaptures,
  fixturePluginFile,
  snapshotOf,
  value,
} from "./slot-fixtures";

const file = fixturePluginFile();
const demands = completionDemands(file);

describe("the sweep list", () => {
  test("pairs every failure with the patterns indexed on the failing node's kind", () => {
    const model = foldElicitedModel(
      snapshotOf(completeCaptures().filter((c) => c.id !== "c-stamp-duration")),
      file,
    );
    const report = evaluateCompletion(model, demands);
    const list = buildSweepList(model, report, file.patterns);
    expect(list.unsatisfied.map((f) => f.diagnostic)).toEqual(["unaddressed"]);
    expect(list.patterns).toEqual([
      { id: "P01", nodeId: "step:stamp", ask: "ask how often" },
    ]);
  });

  test("surfaces nothing for a complete model", () => {
    const model = foldElicitedModel(snapshotOf(completeCaptures()), file);
    const list = buildSweepList(
      model,
      evaluateCompletion(model, demands),
      file.patterns,
    );
    expect(list).toEqual({ unsatisfied: [], patterns: [] });
  });
});

describe("the cue signal", () => {
  test("states the revision, the verdict, each unsatisfied slot, and discretionary patterns", () => {
    const model = foldElicitedModel(
      snapshotOf([
        ...completeCaptures().filter((c) => c.id !== "c-stamp-duration"),
        assertionCapture(
          "c-pack-actor",
          value("step", "pack", "who performs it", "named", "nobody"),
        ),
      ]),
      file,
    );
    const report = evaluateCompletion(model, demands);
    const signal = buildCompletionCueSignal(
      model,
      report,
      buildSweepList(model, report, file.patterns),
    );
    expect(signal.type).toBe("completion-cue");
    expect(signal.body).toContain(`revision ${report.revision}`);
    expect(signal.body).toContain("Complete: no");
    expect(signal.body).toContain("[unaddressed]");
    expect(signal.body).toContain("P01 on step:stamp: ask how often");
    expect(signal.body).toContain(
      "1 node(s) lie outside every objective's dependency slice",
    );
    expect(signal.body).toContain("does not decide whether to continue");
  });

  test("truncates long lists and says how many it left out", () => {
    const captures = completeCaptures().filter(
      (c) =>
        ![
          "c-stamp-duration",
          "c-stamp-actor",
          "c-widget-distinctions",
          "c-press-distinctions",
        ].includes(c.id),
    );
    const model = foldElicitedModel(snapshotOf(captures), file);
    const report = evaluateCompletion(model, demands);
    const signal = buildCompletionCueSignal(
      model,
      report,
      buildSweepList(model, report, file.patterns),
      {
        maxItems: 2,
      },
    );
    expect(report.failures.length).toBeGreaterThan(2);
    expect(signal.body).toContain(`and ${report.failures.length - 2} more`);
  });

  test("instruction fragments are render-invariant prose", () => {
    for (const fragment of completionProtocolInstructionFragments()) {
      expect(fragment).not.toMatch(/\$\{|revision [0-9a-f]/u);
    }
  });
});
