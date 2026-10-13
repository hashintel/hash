import { use, useEffect, useState } from "react";

import { getOwn } from "@hashintel/petrinaut-core";
import {
  analyzeCompilation,
  summarizeGpuUnavailability,
} from "@hashintel/petrinaut-core/webgpu";

import { experimentSdcpnWithMetrics } from "../../../../../../react/experiments/experiment-sdcpn-with-metrics";
import { LanguageClientContext } from "../../../../../../react/lsp/context";

import type { ExperimentMetricSpecInput } from "../../../../../../react/experiments/context";
import type { LanguageClientContextValue } from "../../../../../../react/lsp/context";
import type {
  HirArtifacts,
  MonteCarloMetricSpec,
  PetrinautExtensionSettings,
  SDCPN,
} from "@hashintel/petrinaut-core";

export type GpuAvailability = {
  available: boolean;
  reason: string | null;
  pending: boolean;
};

/**
 * Attaches each expression spec's compiled artifact, as the experiment request
 * does, so the compilation report can gate the metrics the run would carry.
 * Null when a metric has no artifact, with the request builder's own sentence.
 */
const attachMetricArtifacts = (
  specs: readonly ExperimentMetricSpecInput[],
  artifacts: HirArtifacts,
):
  | { ok: true; specs: MonteCarloMetricSpec[] }
  | { ok: false; reason: string } => {
  const withArtifacts: MonteCarloMetricSpec[] = [];
  for (const spec of specs) {
    if (spec.kind !== "expression") {
      withArtifacts.push(spec);
      continue;
    }
    const artifact = getOwn(artifacts.metrics, spec.id);
    if (!artifact) {
      return { ok: false, reason: `Metric "${spec.label}" did not compile.` };
    }
    withArtifacts.push({ ...spec, artifact });
  }
  return { ok: true, specs: withArtifacts };
};

/** What the analysis ran on. */
type AnalysisInput = {
  sdcpn: SDCPN;
  extensions: PetrinautExtensionSettings;
  specsKey: string | null;
  requestHirArtifacts: LanguageClientContextValue["requestHirArtifacts"];
};

/**
 * Why the GPU backend could not run `input`, or null when it could. A net that
 * fails to compile yields a reason rather than an error.
 */
const analyzeGpuUnavailability = async ({
  sdcpn,
  extensions,
  specsKey,
  requestHirArtifacts,
}: AnalysisInput): Promise<string | null> => {
  const specs =
    specsKey === null
      ? []
      : (JSON.parse(specsKey) as ExperimentMetricSpecInput[]);
  const experimentSdcpn = experimentSdcpnWithMetrics(sdcpn, specs);
  try {
    const { artifacts } = await requestHirArtifacts(
      experimentSdcpn,
      extensions,
      { includeHir: true },
    );
    const attached = attachMetricArtifacts(specs, artifacts);
    return attached.ok
      ? summarizeGpuUnavailability(
          analyzeCompilation({
            sdcpn: experimentSdcpn,
            artifacts,
            extensions,
            metricSpecs: attached.specs,
          }),
        )
      : attached.reason;
  } catch (caught) {
    return caught instanceof Error
      ? `The net could not be compiled: ${caught.message}`
      : "The net could not be compiled.";
  }
};

/**
 * Whether the GPU backend could run a compute request over this net with
 * these metrics, and the reason when it could not.
 *
 * One asynchronous path: the net the experiment would compile (its metrics
 * replaced by the form's expression metrics) is lowered with its HIR trees in
 * the language worker, and the compilation report gates the metrics and
 * compiles the shader with the accepted ones, so the switch, the Compilation
 * panel and the run-time backend selection give the same reason for the same
 * metric. The form rebuilds its spec array every render, so the analysis keys
 * on the specs' serialised content rather than on the array's identity, and
 * a change waits `GPU_ANALYSIS_DEBOUNCE_MS` before it lowers the net, so a
 * metric typed keystroke by keystroke costs one lowering, not one per key.
 * While an analysis is pending the previous reason stands.
 */

/** How long a spec change settles before the net is lowered again. */
export const GPU_ANALYSIS_DEBOUNCE_MS = 250;
export const useGpuAvailability = ({
  enabled,
  sdcpn,
  extensions,
  metricSpecs,
}: {
  enabled: boolean;
  sdcpn: SDCPN;
  extensions: PetrinautExtensionSettings;
  metricSpecs: readonly ExperimentMetricSpecInput[] | null;
}): GpuAvailability => {
  const { requestHirArtifacts } = use(LanguageClientContext);
  const specsKey = metricSpecs === null ? null : JSON.stringify(metricSpecs);
  // The latest analysis, with the input it ran on. It is pending while the
  // input has moved on, and its reason stands until the next one lands.
  const [analysis, setAnalysis] = useState<{
    input: AnalysisInput;
    reason: string | null;
  } | null>(null);
  const pending =
    analysis?.input.sdcpn !== sdcpn ||
    analysis.input.extensions !== extensions ||
    analysis.input.specsKey !== specsKey ||
    analysis.input.requestHirArtifacts !== requestHirArtifacts;
  const reason = analysis?.reason ?? null;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    const input = { sdcpn, extensions, specsKey, requestHirArtifacts };
    const timer = setTimeout(() => {
      void analyzeGpuUnavailability(input).then((nextReason) => {
        if (!cancelled) {
          setAnalysis({ input, reason: nextReason });
        }
      });
    }, GPU_ANALYSIS_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, sdcpn, extensions, specsKey, requestHirArtifacts]);

  if (!enabled) {
    return { available: false, reason: null, pending: false };
  }
  if (pending) {
    return { available: false, reason, pending: true };
  }
  if (reason !== null) {
    return { available: false, reason, pending: false };
  }
  return { available: true, reason: null, pending: false };
};
