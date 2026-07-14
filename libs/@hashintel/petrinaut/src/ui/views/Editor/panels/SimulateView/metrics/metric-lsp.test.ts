import { describe, expect, it, vi } from "vitest";

import { DiagnosticSeverity } from "@hashintel/petrinaut-core";

import { summarizeMetricLspErrors, validateMetricCompiles } from "./metric-lsp";

describe("metric LSP validation", () => {
  it("counts only error-severity diagnostics from the selected session", () => {
    const diagnostics = new Map([
      [
        "inmemory://sdcpn/_temp/metrics/current/code.ts",
        [
          { message: "error", severity: DiagnosticSeverity.Error },
          { message: "warning", severity: DiagnosticSeverity.Warning },
          { message: "hint", severity: DiagnosticSeverity.Hint },
        ],
      ],
      [
        "inmemory://sdcpn/_temp/metrics/other/code.ts",
        [{ message: "other", severity: DiagnosticSeverity.Error }],
      ],
    ]);

    expect(summarizeMetricLspErrors(diagnostics, "current")).toEqual({
      count: 1,
      firstMessage: "error",
    });
  });

  it("uses exact submit-time compilation as the mutation barrier", async () => {
    const requestHirArtifacts = vi.fn().mockResolvedValue({
      artifacts: {
        version: 4,
        fingerprint: "0000000000000000",
        dynamics: {},
        lambdas: {},
        kernels: {},
        metrics: {},
      },
      failures: [
        {
          itemId: "metric-id",
          itemType: "metric",
          diagnostics: [{ message: "Unsupported metric body" }],
        },
      ],
    });

    await expect(
      validateMetricCompiles({
        requestHirArtifacts,
        sdcpn: {
          types: [],
          differentialEquations: [],
          parameters: [],
          places: [],
          transitions: [],
        },
        extensions: {
          colors: true,
          stochasticity: true,
          dynamics: true,
          parameters: true,
          subnets: true,
        },
        metric: {
          id: "metric-id",
          name: "Metric",
          description: "",
          code: "return unsupported();",
        },
      }),
    ).resolves.toBe("Unsupported metric body");
  });
});
