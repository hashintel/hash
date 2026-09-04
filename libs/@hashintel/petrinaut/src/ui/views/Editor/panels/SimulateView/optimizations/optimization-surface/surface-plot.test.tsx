/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildOptimizationSurfaceAxes } from "../../../../../../../react/optimizations/surface-grid";
import { contourSurfaceKey } from "../../../../../../components/contour-surface";
import {
  makeOptimizationInput,
  optimizedBindingSets,
} from "../optimizations-story-fixtures";
import {
  describeSurfaceState,
  inFlightSurfaceField,
  mergeSurfaceFields,
  navigatedSurfaceSample,
  OptimizationSurfacePlot,
  surfaceInteraction,
  trialSurfaceField,
  withNavigatedSample,
} from "./surface-plot";

import type { OptimizationSelectionStream } from "../../../../../../../react/optimizations/context";
import type {
  MonteCarloUserDefinedMetricFrame,
  PetrinautOptimizationTrialEvent,
} from "@hashintel/petrinaut-core";

vi.mock("@hashintel/ds-components", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@hashintel/ds-components")>();
  const Select = ({
    items,
    onChange,
    value,
    "aria-label": ariaLabel,
  }: {
    items: readonly { value: string; text: string }[];
    onChange: (value: string | null) => void;
    value: string | null;
    "aria-label"?: string;
  }) => (
    <select
      aria-label={ariaLabel}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value || null)}
    >
      {items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.text}
        </option>
      ))}
    </select>
  );
  return { ...actual, Select };
});

vi.mock(
  "../../../../../../components/contour-surface",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../../../../../components/contour-surface")
      >();
    const ContourSurface = ({
      onPickFraction,
      onPreviewFraction,
      "aria-label": ariaLabel,
    }: {
      onPickFraction?: unknown;
      onPreviewFraction?: unknown;
      "aria-label"?: string;
    }) => (
      <canvas
        aria-label={ariaLabel}
        data-interactive={onPickFraction ? "" : undefined}
        data-previews={onPreviewFraction ? "" : undefined}
      />
    );
    return { ...actual, ContourSurface };
  },
);

afterEach(cleanup);

const input = makeOptimizationInput(optimizedBindingSets.base);
const metricId = input.objective.metricId;
const axes = buildOptimizationSurfaceAxes(input);
const [xAxis, yAxis] = axes as [(typeof axes)[number], (typeof axes)[number]];

// production_rate spans 50..400 and selling_price 20..60, both over 50
// positions drawn on an 11-point grid: 225 and 40 sit at the grid's centre.
const trial = (
  index: number,
  parameters: Record<string, number>,
  objective: number | null,
): PetrinautOptimizationTrialEvent => ({
  type: "trial",
  trial: index,
  parameters,
  objective,
  state: objective === null ? "pruned" : "complete",
  best: null,
  seq: index + 2,
});

const trials = [
  trial(0, { production_rate: 225, selling_price: 40 }, 4),
  trial(1, { production_rate: 50, selling_price: 20 }, 1),
  trial(2, { production_rate: 400, selling_price: 60 }, null),
];
const best = { trial: 0, parameters: trials[0]!.parameters, objective: 4 };

const distributionFrame = (
  bins: readonly (readonly [number, number])[],
): MonteCarloUserDefinedMetricFrame => ({
  metricId,
  label: "Profit",
  outputType: "distribution",
  frameNumber: 1,
  time: 1,
  bins,
  value: null,
  frameValue: null,
  timeValue: null,
  runSampleCount: 4,
  timeSampleCount: 4,
});

const stream = (
  overrides: Partial<OptimizationSelectionStream>,
): OptimizationSelectionStream => ({
  key: "production_rate=25|selling_price=25",
  metricFrames: [
    distributionFrame([
      [10, 2],
      [20, 2],
    ]),
  ],
  runsCompleted: 4,
  runTarget: null,
  computing: true,
  error: null,
  note: null,
  ...overrides,
});

const centre = { production_rate: 25, selling_price: 25 };

describe("trialSurfaceField", () => {
  it("samples the field at each trial with an objective and marks pruned trials hollow", () => {
    const field = trialSurfaceField({
      trials,
      best,
      xAxis,
      yAxis,
      mark: "dot",
    });

    expect([...field.values]).toEqual([
      [contourSurfaceKey(5, 5), 4],
      [contourSurfaceKey(0, 0), 1],
    ]);
    expect(field.markers).toEqual([
      { x: 5, y: 5, kind: "dot", emphasis: true },
      { x: 0, y: 0, kind: "dot", emphasis: false },
      { x: 10, y: 10, kind: "muted" },
    ]);
  });

  it("draws rings instead of dots for a field computed elsewhere, leaving pruned trials out", () => {
    const field = trialSurfaceField({
      trials,
      best: null,
      xAxis,
      yAxis,
      mark: "ring",
    });

    expect(field.markers.map((marker) => marker.kind)).toEqual([
      "point",
      "point",
    ]);
    expect(field.markers.every((marker) => marker.emphasis !== true)).toBe(
      true,
    );
  });

  it("skips a trial without a numeric value on a shown axis", () => {
    const field = trialSurfaceField({
      trials: [trial(0, { production_rate: 225 }, 4)],
      best: null,
      xAxis,
      yAxis,
      mark: "dot",
    });

    expect(field.values.size).toBe(0);
    expect(field.markers).toHaveLength(0);
  });
});

describe("inFlightSurfaceField", () => {
  it("rings every step being evaluated and samples the field where one has a running value", () => {
    const field = inFlightSurfaceField({
      inFlight: [
        {
          trial: 3,
          parameters: { production_rate: 225, selling_price: 40 },
          objective: 2.5,
        },
        {
          trial: 4,
          parameters: { production_rate: 50, selling_price: 60 },
          objective: null,
        },
      ],
      xAxis,
      yAxis,
    });

    expect([...field.values]).toEqual([[contourSurfaceKey(5, 5), 2.5]]);
    expect(field.markers).toEqual([
      { x: 5, y: 5, kind: "point" },
      { x: 0, y: 10, kind: "point" },
    ]);
  });

  it("merges beneath the trials' field, the later value winning at a shared point", () => {
    const merged = mergeSurfaceFields(
      { values: new Map([[contourSurfaceKey(5, 5), 4]]), markers: [] },
      {
        values: new Map([[contourSurfaceKey(5, 5), 2.5]]),
        markers: [{ x: 5, y: 5, kind: "point" }],
      },
    );

    expect(merged.values.get(contourSurfaceKey(5, 5))).toBe(2.5);
    expect(merged.markers).toHaveLength(1);
  });
});

describe("navigatedSurfaceSample", () => {
  it("streams the followed step's running objective at the navigation until its event lands", () => {
    const following = stream({ key: "trial:3" });

    expect(
      navigatedSurfaceSample({
        selection: following,
        trials,
        metricId,
        xAxis,
        yAxis,
        positions: centre,
      }),
    ).toEqual({ x: 5, y: 5, value: 15 });

    expect(
      navigatedSurfaceSample({
        selection: following,
        trials: [
          ...trials,
          trial(3, { production_rate: 225, selling_price: 40 }, 15.2),
        ],
        metricId,
        xAxis,
        yAxis,
        positions: centre,
      }),
    ).toBeNull();
  });

  it("places the refined value at the picked point once the study has settled", () => {
    expect(
      navigatedSurfaceSample({
        selection: stream({ computing: false, runsCompleted: 100 }),
        trials,
        metricId,
        xAxis,
        yAxis,
        positions: { production_rate: 50, selling_price: 0 },
      }),
    ).toEqual({ x: 10, y: 0, value: 15 });
  });

  it("has no value before frames arrive, on a failed point, or without a stream", () => {
    const arguments_ = { trials, metricId, xAxis, yAxis, positions: centre };

    expect(
      navigatedSurfaceSample({ ...arguments_, selection: null }),
    ).toBeNull();
    expect(
      navigatedSurfaceSample({
        ...arguments_,
        selection: stream({ metricFrames: [] }),
      }),
    ).toBeNull();
    expect(
      navigatedSurfaceSample({
        ...arguments_,
        selection: stream({ error: "cpu: unsupported net" }),
      }),
    ).toBeNull();
  });
});

describe("withNavigatedSample", () => {
  it("lays the live sample over the trials' field, replacing a value at the same point", () => {
    const values = new Map([
      [contourSurfaceKey(5, 5), 4],
      [contourSurfaceKey(0, 0), 1],
    ]);

    expect(withNavigatedSample(values, null)).toBe(values);
    expect([...withNavigatedSample(values, { x: 2, y: 3, value: 9 })]).toEqual([
      [contourSurfaceKey(5, 5), 4],
      [contourSurfaceKey(0, 0), 1],
      [contourSurfaceKey(2, 3), 9],
    ]);
    expect(
      withNavigatedSample(values, { x: 5, y: 5, value: 4.5 }).get(
        contourSurfaceKey(5, 5),
      ),
    ).toBe(4.5);
  });
});

describe("surfaceInteraction", () => {
  it("only displays while a running study is followed, and navigates otherwise", () => {
    expect(
      surfaceInteraction({ status: "running" }, { followTrials: true }),
    ).toBe("following");
    expect(
      surfaceInteraction({ status: "initializing" }, { followTrials: true }),
    ).toBe("following");
    expect(
      surfaceInteraction({ status: "running" }, { followTrials: false }),
    ).toBe("navigable");
    expect(
      surfaceInteraction({ status: "complete" }, { followTrials: true }),
    ).toBe("navigable");
    expect(
      surfaceInteraction({ status: "cancelled" }, { followTrials: true }),
    ).toBe("navigable");
  });
});

describe("describeSurfaceState", () => {
  it("counts the placed steps and the best while the optimizer chooses", () => {
    expect(
      describeSurfaceState({
        trials: [],
        best: null,
        interaction: "following",
        selection: null,
      }),
    ).toBe("no steps placed yet · the optimizer is choosing the next point");
    expect(
      describeSurfaceState({
        trials,
        best,
        interaction: "following",
        selection: stream({ key: "trial:3" }),
      }),
    ).toBe(
      "3 steps placed · best 4 · the optimizer is choosing the next point",
    );
  });

  it("reports the picked point's refinement, then invites a pick", () => {
    expect(
      describeSurfaceState({
        trials,
        best,
        interaction: "navigable",
        selection: stream({ runsCompleted: 8, runTarget: 25 }),
      }),
    ).toBe(
      "3 steps · refining the picked point: 8 of 25 runs · drag or click to refine a point",
    );
    expect(
      describeSurfaceState({
        trials,
        best,
        interaction: "navigable",
        selection: stream({ runsCompleted: 8 }),
      }),
    ).toBe(
      "3 steps · refining the picked point: 8 runs · drag or click to refine a point",
    );
    expect(
      describeSurfaceState({
        trials: trials.slice(0, 1),
        best,
        interaction: "navigable",
        selection: stream({ computing: false, runsCompleted: 100 }),
      }),
    ).toBe("1 step · drag or click to refine a point");
  });
});

describe("OptimizationSurfacePlot", () => {
  const renderPlot = (
    onPick: ((picked: Record<string, number>) => void) | undefined,
  ) =>
    render(
      <OptimizationSurfacePlot
        axes={axes}
        view={{ xAxisId: xAxis.identifier, yAxisId: yAxis.identifier }}
        onViewChange={() => {}}
        positions={centre}
        values={new Map()}
        markers={[]}
        sampleMarks="none"
        contentKey="study"
        onPick={onPick}
        caption="3 steps"
      />,
    );

  it("is display-only without a pick handler and arms picks and previews with one", () => {
    const { unmount } = renderPlot(undefined);
    const passive = screen.getByLabelText("Optimization surface");
    expect(passive.hasAttribute("data-interactive")).toBe(false);
    expect(passive.hasAttribute("data-previews")).toBe(false);
    expect(screen.getByText("3 steps")).toBeTruthy();
    unmount();

    renderPlot(() => {});
    const active = screen.getByLabelText("Optimization surface");
    expect(active.hasAttribute("data-interactive")).toBe(true);
    expect(active.hasAttribute("data-previews")).toBe(true);
  });
});
