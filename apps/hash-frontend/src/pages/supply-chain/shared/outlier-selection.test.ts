import { describe, expect, it } from "vitest";

import {
  makeNode,
  obs,
  stepFrom,
  timingSeriesFrom,
} from "./observation-fixtures";
import {
  applyOutlierSelectionToNode,
  applyOutlierSelectionToStep,
} from "./outlier-selection";

// Characterization tests for the client-side Tukey 1.5x IQR outlier rule.
// Behaviour pinned here MUST survive the contract refactor (the selected-view
// semantics stay even as the duplicated outlier paths were collapsed).

describe("applyOutlierSelectionToStep", () => {
  // One clear high outlier (100) far beyond the Tukey upper fence.
  const withOutlier = () =>
    stepFrom([
      obs("2026-01", 10),
      obs("2026-01", 11),
      obs("2026-02", 12),
      obs("2026-02", 13),
      obs("2026-03", 14),
      obs("2026-03", 15),
      obs("2026-04", 16),
      obs("2026-04", 17),
      obs("2026-04", 100),
    ]);

  it("drops out-of-fence points and recomputes stats when excluding outliers", () => {
    const selected = applyOutlierSelectionToStep(withOutlier(), true);
    expect(selected.durations).toEqual([10, 11, 12, 13, 14, 15, 16, 17]);
    expect(selected.stats.n).toBe(8);
    expect(selected.excluded_count).toBe(1);
    expect(selected.excluded_pct).toBeCloseTo(100 / 9, 1);
  });

  it("returns the full series unchanged when including outliers", () => {
    const selected = applyOutlierSelectionToStep(withOutlier(), false);
    expect(selected.stats.n).toBe(9);
    expect(selected.excluded_count).toBe(0);
    expect(selected.excluded_pct).toBe(0);
  });

  it("excludes nothing for a tight distribution", () => {
    const selected = applyOutlierSelectionToStep(
      stepFrom([
        obs("2026-01", 10),
        obs("2026-02", 12),
        obs("2026-03", 11),
        obs("2026-04", 13),
      ]),
      true,
    );
    expect(selected.stats.n).toBe(4);
    expect(selected.excluded_count).toBe(0);
  });

  it("outlier-filters the secondary complete_timing series independently of the headline", () => {
    const step = stepFrom([
      obs("2026-01", 10),
      obs("2026-02", 12),
      obs("2026-03", 11),
      obs("2026-04", 13),
    ]);
    // Headline is tight; the secondary series carries one clear high outlier.
    step.complete_timing = timingSeriesFrom([
      obs("2026-01", 20),
      obs("2026-01", 21),
      obs("2026-02", 22),
      obs("2026-02", 23),
      obs("2026-03", 24),
      obs("2026-03", 25),
      obs("2026-04", 26),
      obs("2026-04", 27),
      obs("2026-04", 200),
    ]);
    const selected = applyOutlierSelectionToStep(step, true);
    // Headline untouched, secondary loses its outlier.
    expect(selected.stats.n).toBe(4);
    expect(selected.excluded_count).toBe(0);
    expect(selected.complete_timing?.stats.n).toBe(8);
    expect(
      selected.complete_timing?.observations.map(
        (observation) => observation.value,
      ),
    ).not.toContain(200);
  });

  it("leaves complete_timing untouched when including outliers", () => {
    const step = stepFrom([obs("2026-01", 10), obs("2026-02", 12)]);
    step.complete_timing = timingSeriesFrom([
      obs("2026-01", 20),
      obs("2026-02", 200),
    ]);
    const selected = applyOutlierSelectionToStep(step, false);
    expect(selected.complete_timing?.stats.n).toBe(2);
  });
});

describe("applyOutlierSelectionToNode", () => {
  // Shipped v1 data carries a single base series (no raw_*/filtered_*), so today
  // both toggle states return the base series untouched. The fixture uses a tight
  // distribution so this invariant also holds once Tukey IQR filtering lands.
  it("returns the base series when including outliers", () => {
    const out = applyOutlierSelectionToNode(makeNode(), false);
    expect(out.observations?.map((observation) => observation.value)).toEqual([
      10, 12, 11, 13,
    ]);
  });

  it("returns the base series when excluding outliers and none lie beyond the fences", () => {
    const out = applyOutlierSelectionToNode(makeNode(), true);
    expect(out.observations?.map((observation) => observation.value)).toEqual([
      10, 12, 11, 13,
    ]);
  });
});
