import { describe, expect, it } from "vitest";

import {
  areMetricLspDiagnosticSummariesEqual,
  getExperimentMetricDiagnosticError,
} from "./experiment-metric-lsp-validation";

describe("experiment metric LSP validation", () => {
  it("compares diagnostic summaries by count and first message", () => {
    expect(
      areMetricLspDiagnosticSummariesEqual(
        { count: 1, firstMessage: "Unknown place" },
        { count: 1, firstMessage: "Unknown place" },
      ),
    ).toBe(true);

    expect(
      areMetricLspDiagnosticSummariesEqual(
        { count: 1, firstMessage: "Unknown place" },
        { count: 2, firstMessage: "Unknown place" },
      ),
    ).toBe(false);

    expect(
      areMetricLspDiagnosticSummariesEqual(
        { count: 1, firstMessage: "Unknown place" },
        { count: 1, firstMessage: "Unknown transition" },
      ),
    ).toBe(false);
  });

  it("returns the first expression metric diagnostic as a footer error", () => {
    expect(
      getExperimentMetricDiagnosticError([
        {
          kind: "placeTokenCountMean",
          label: "Ignored",
          lspDiagnostics: {
            count: 3,
            firstMessage: "Built-in metric diagnostics should be ignored",
          },
        },
        {
          kind: "expression",
          label: "Infection ratio",
          lspDiagnostics: {
            count: 1,
            firstMessage: "Property 'Missing' does not exist.",
          },
        },
      ]),
    ).toBe(
      "Metric \"Infection ratio\" has 1 code diagnostic: Property 'Missing' does not exist.",
    );
  });

  it("uses a fallback label and plural diagnostics message", () => {
    expect(
      getExperimentMetricDiagnosticError([
        {
          kind: "expression",
          label: "   ",
          lspDiagnostics: {
            count: 2,
            firstMessage: undefined,
          },
        },
      ]),
    ).toBe('Metric "Untitled metric" has 2 code diagnostics.');
  });

  it("returns null when no expression metric has diagnostics", () => {
    expect(
      getExperimentMetricDiagnosticError([
        {
          kind: "expression",
          label: "Valid custom metric",
          lspDiagnostics: {
            count: 0,
            firstMessage: undefined,
          },
        },
      ]),
    ).toBeNull();
  });
});
