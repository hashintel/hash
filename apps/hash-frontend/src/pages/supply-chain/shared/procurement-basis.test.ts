import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ensureNodeStats } from "./normalize-contract";
import {
  makeNode,
  obs,
  stepFrom,
  timingSeriesFrom,
} from "./observation-fixtures";
import {
  applyProcurementBasisToNode,
  applyProcurementBasisToStep,
  filterGraphNodeByDateRange,
} from "./range-filter";

import type { GraphNode, StepDetail } from "./types";

// Combined first/last receipt observations, so a basis swap is observable from a
// single series.
function procurementNode(): GraphNode {
  return ensureNodeStats(
    makeNode({
      id: "procurement_x",
      type: "procurement",
      observations: [
        {
          first_receipt_date: "2026-01-01",
          first_receipt_value: 8,
          last_receipt_date: "2026-01-24",
          last_receipt_value: 24,
        },
        {
          first_receipt_date: "2026-02-01",
          first_receipt_value: 10,
          last_receipt_date: "2026-02-26",
          last_receipt_value: 26,
        },
        {
          first_receipt_date: "2026-03-01",
          first_receipt_value: 9,
          last_receipt_date: "2026-03-25",
          last_receipt_value: 25,
        },
        {
          first_receipt_date: "2026-04-01",
          first_receipt_value: 11,
          last_receipt_date: "2026-04-27",
          last_receipt_value: 27,
        },
      ] as unknown as GraphNode["observations"],
      monthly: [],
    }),
  );
}

function procurementStep(): StepDetail {
  const step = stepFrom([
    obs("2026-01", 8),
    obs("2026-02", 10),
    obs("2026-03", 9),
    obs("2026-04", 11),
  ]);
  step.type = "procurement";
  step.id = "procurement_x";
  step.complete_timing = timingSeriesFrom([
    obs("2026-01", 24),
    obs("2026-02", 26),
    obs("2026-03", 25),
    obs("2026-04", 27),
  ]);
  return step;
}

describe("applyProcurementBasisToNode", () => {
  it("is a no-op for the first-receipt basis", () => {
    const node = procurementNode();
    expect(
      applyProcurementBasisToNode(node, "first").observations?.map(
        (observation) => observation.value,
      ),
    ).toEqual([8, 10, 9, 11]);
  });

  it("promotes the full-receipt series from combined observations for the complete basis", () => {
    const out = applyProcurementBasisToNode(procurementNode(), "complete");
    expect(out.stats.median).toBe(25.5);
    expect(out.observations?.map((observation) => observation.value)).toEqual([
      24, 26, 25, 27,
    ]);
    expect(out).not.toHaveProperty("complete_series");
  });

  it("ignores non-procurement nodes and procurement nodes without full-receipt data", () => {
    const plain = makeNode({ type: "transit" });
    expect(applyProcurementBasisToNode(plain, "complete")).toBe(plain);
    const bare = makeNode({ type: "procurement" });
    expect(applyProcurementBasisToNode(bare, "complete")).toBe(bare);
  });
});

describe("applyProcurementBasisToStep", () => {
  it("swaps headline + parks first-receipt in complete_timing for the complete basis", () => {
    const out = applyProcurementBasisToStep(procurementStep(), "complete");
    // Headline is now full receipt...
    expect(out.stats.median).toBe(25.5);
    expect(out.observations.map((observation) => observation.value)).toEqual([
      24, 26, 25, 27,
    ]);
    // ...and the secondary cell now carries the first-receipt series.
    expect(out.complete_timing?.label).toBe("First receipt");
    expect(out.complete_timing?.stats.median).toBe(9.5);
  });

  it("is a no-op for the first-receipt basis", () => {
    const step = procurementStep();
    expect(applyProcurementBasisToStep(step, "first")).toBe(step);
  });
});

describe("filterGraphNodeByDateRange with basis", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("windows the full-receipt series when basis is complete", () => {
    // 3m cutoff = 2026-04; keep months >= 2026-04 of the complete series.
    const out = filterGraphNodeByDateRange(
      procurementNode(),
      "3m",
      true,
      "complete",
    );
    expect(out.observations?.map((observation) => observation.value)).toEqual([
      27,
    ]);
    expect(out.stats.median).toBe(27);
  });
});
