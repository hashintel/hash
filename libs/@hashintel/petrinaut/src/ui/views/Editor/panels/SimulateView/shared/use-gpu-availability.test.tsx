/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_LANGUAGE_CLIENT_CONTEXT,
  LanguageClientContext,
} from "../../../../../../react/lsp/context";
import { sirSdcpnContextValue } from "../experiments/experiments-story-fixtures";
import {
  GPU_ANALYSIS_DEBOUNCE_MS,
  useGpuAvailability,
} from "./use-gpu-availability";

import type { ExperimentMetricSpecInput } from "../../../../../../react/experiments/context";
import type { ReactNode } from "react";

// What the analysis concludes is petrinaut-core's to test; this hook is about
// when it runs.
vi.mock("@hashintel/petrinaut-core/webgpu", () => ({
  analyzeCompilation: () => ({}),
  summarizeGpuUnavailability: () => null,
}));

const metric = (code: string): ExperimentMetricSpecInput => ({
  kind: "expression",
  id: "peak",
  label: "Peak",
  code,
  sampleRuns: "all",
  runOutput: { type: "distribution", binning: "exact" },
});

const { petriNetDefinition: sdcpn, extensions } = sirSdcpnContextValue;

describe("useGpuAvailability", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("lowers the net once for a burst of spec changes, pending until it lands", async () => {
    const client = {
      ...DEFAULT_LANGUAGE_CLIENT_CONTEXT,
      requestHirArtifacts: vi.fn(
        DEFAULT_LANGUAGE_CLIENT_CONTEXT.requestHirArtifacts,
      ),
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <LanguageClientContext value={client}>{children}</LanguageClientContext>
    );
    const { result, rerender } = renderHook(
      ({ specs }: { specs: readonly ExperimentMetricSpecInput[] }) =>
        useGpuAvailability({
          enabled: true,
          sdcpn,
          extensions,
          metricSpecs: specs,
        }),
      { initialProps: { specs: [metric("return 1;")] }, wrapper },
    );

    expect(result.current.pending).toBe(true);
    rerender({ specs: [metric("return 1 +")] });
    rerender({ specs: [metric("return 1 + 2;")] });
    expect(client.requestHirArtifacts).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(GPU_ANALYSIS_DEBOUNCE_MS);
    });

    expect(client.requestHirArtifacts).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(false);
  });
});
