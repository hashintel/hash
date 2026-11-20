import { describe, expect, it } from "vitest";

import { DiagnosticSeverity, type SDCPN } from "@hashintel/petrinaut-core";

import { getMetricDocumentUri } from "../../../../../../monaco/editor-paths";
import {
  buildMetricSpecs,
  createDefaultMetricDraft,
  type ExperimentMetricDraft,
  metricKindPatch,
  summarizeMetricDraftLspErrors,
} from "./metric-drafts";

const place = (id: string, name: string): SDCPN["places"][number] => ({
  id,
  name,
  colorId: null,
  dynamicsEnabled: false,
  x: 0,
  y: 0,
});

const sdcpn: SDCPN = {
  places: [place("queue", "Queue"), place("done", "Done")],
  transitions: [
    {
      id: "serve",
      name: "Serve",
      inputArcs: [],
      outputArcs: [],
      lambdaType: "predicate",
      lambdaCode: "",
      transitionKernelCode: "",
      x: 0,
      y: 0,
    },
  ],
  types: [],
  differentialEquations: [],
  parameters: [],
  metrics: [{ id: "backlog", name: "Backlog", code: "return 1;" }],
};

const draft = (
  overrides: Partial<ExperimentMetricDraft> = {},
): ExperimentMetricDraft => ({
  ...createDefaultMetricDraft(sdcpn),
  id: "metric",
  ...overrides,
});

describe("metricKindPatch", () => {
  it("fills an expression from the model metric the value names", () => {
    const { metricSessionId, ...rest } =
      metricKindPatch(
        draft({ metricSessionId: "replaced" }),
        "model:backlog",
        sdcpn,
      ) ?? {};

    expect(rest).toEqual({
      kind: "expression",
      code: "return 1;",
      sourceMetricId: "backlog",
      label: "Backlog",
    });
    expect(metricSessionId).toBeTypeOf("string");
    expect(metricSessionId).not.toBe("replaced");
  });

  it("is null for a model metric that no longer exists", () => {
    expect(metricKindPatch(draft(), "model:removed", sdcpn)).toBeNull();
  });

  it("keeps a label the user wrote, to and from a model metric", () => {
    const written = draft({ label: "My metric" });

    expect(metricKindPatch(written, "model:backlog", sdcpn)?.label).toBe(
      "My metric",
    );
    expect(metricKindPatch(written, "expression", sdcpn)).toEqual({
      kind: "expression",
      label: "My metric",
      sourceMetricId: null,
    });
  });

  it("returns a model metric's name to the default label", () => {
    expect(
      metricKindPatch(draft({ label: "Backlog" }), "expression", sdcpn)?.label,
    ).toBe("Custom metric");
  });

  it("points the draft at the first place or transition when its own is gone", () => {
    const stale = draft({ placeId: "removed", transitionId: "removed" });

    expect(metricKindPatch(stale, "placeTokenCountMean", sdcpn)?.placeId).toBe(
      "queue",
    );
    expect(
      metricKindPatch(stale, "transitionFiringCount", sdcpn)?.transitionId,
    ).toBe("serve");
    expect(
      metricKindPatch(draft({ placeId: "done" }), "placeTokenCountMean", sdcpn),
    ).not.toHaveProperty("placeId");
  });
});

describe("buildMetricSpecs", () => {
  it("labels a built-in metric after its place or transition", () => {
    expect(
      buildMetricSpecs(
        [
          draft({ id: "tokens", placeId: "done" }),
          draft({
            id: "firing",
            kind: "transitionFiringCount",
            transitionMode: "cumulative",
          }),
        ],
        sdcpn,
      ),
    ).toEqual([
      {
        id: "tokens",
        label: "Done tokens",
        sampleRuns: "all",
        runOutput: { type: "distribution" },
        kind: "placeTokenCountMean",
        placeId: "done",
      },
      {
        id: "firing",
        label: "Serve firing (cumulative)",
        sampleRuns: "all",
        runOutput: { type: "distribution" },
        kind: "transitionFiringCount",
        transitionId: "serve",
        mode: "cumulative",
      },
    ]);
  });

  it("labels an expression after its model metric, or with what was typed", () => {
    const labels = buildMetricSpecs(
      [
        draft({ kind: "expression", label: " Mine ", sourceMetricId: null }),
        draft({ kind: "expression", label: "Mine", sourceMetricId: "backlog" }),
      ],
      sdcpn,
    ).map((spec) => spec.label);

    expect(labels).toEqual(["Mine", "Backlog"]);
  });

  it.each<[string, ExperimentMetricDraft[], string]>([
    ["no metric", [], "Define at least one metric"],
    [
      "a blank label",
      [draft({ kind: "expression", label: " " })],
      "Metric 1 needs a label",
    ],
    [
      "a place that is gone",
      [draft({ placeId: "removed" })],
      'Metric "Place tokens" needs a valid place',
    ],
    [
      "a transition that is gone",
      [draft({ kind: "transitionFiringCount", transitionId: "removed" })],
      'Metric "Transition firing" needs a valid transition',
    ],
    [
      "blank code",
      [draft({ kind: "expression", label: "Rate", code: " " })],
      'Metric "Rate" code is required',
    ],
  ])("refuses %s with the reason the footer shows", (_case, drafts, reason) => {
    expect(() => buildMetricSpecs(drafts, sdcpn)).toThrow(reason);
  });
});

describe("summarizeMetricDraftLspErrors", () => {
  const errorsOf = (sessionId: string, ...messages: string[]) =>
    [
      getMetricDocumentUri(sessionId),
      messages.map((message) => ({
        message,
        severity: DiagnosticSeverity.Error,
      })),
    ] as const;

  it("names the first custom-code metric with an error, and skips a built-in metric's session", () => {
    expect(
      summarizeMetricDraftLspErrors(
        new Map([
          errorsOf("built-in", "A built-in metric's code is not read"),
          errorsOf("ratio", "Property 'Missing' does not exist."),
        ]),
        [
          draft({ label: "Ignored", metricSessionId: "built-in" }),
          draft({
            kind: "expression",
            label: "Infection ratio",
            metricSessionId: "ratio",
          }),
        ],
      ),
    ).toBe(
      "Metric \"Infection ratio\" has 1 code diagnostic: Property 'Missing' does not exist.",
    );
  });

  it("uses a fallback label and the plural for two errors without a message", () => {
    expect(
      summarizeMetricDraftLspErrors(new Map([errorsOf("blank", "", "")]), [
        draft({ kind: "expression", label: "   ", metricSessionId: "blank" }),
      ]),
    ).toBe('Metric "Untitled metric" has 2 code diagnostics.');
  });

  it("is null when no custom-code metric has an error", () => {
    expect(
      summarizeMetricDraftLspErrors(new Map([errorsOf("other", "Elsewhere")]), [
        draft({ kind: "expression", label: "Valid", metricSessionId: "mine" }),
      ]),
    ).toBeNull();
  });
});
