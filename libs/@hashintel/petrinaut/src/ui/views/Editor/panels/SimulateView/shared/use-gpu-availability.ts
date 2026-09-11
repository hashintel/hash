import { use, useEffect, useState } from "react";

import { getOwn } from "@hashintel/petrinaut-core";
import {
  analyzeCompilation,
  summarizeGpuUnavailability,
} from "@hashintel/petrinaut-core/webgpu";

import { experimentSdcpnWithMetrics } from "../../../../../../react/experiments/experiment-sdcpn-with-metrics";
import { LanguageClientContext } from "../../../../../../react/lsp/context";

import type { ExperimentMetricSpecInput } from "../../../../../../react/experiments/context";
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
 * on the specs' serialised content rather than on the array's identity.
 */
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
  const [reason, setReason] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const specsKey = metricSpecs === null ? null : JSON.stringify(metricSpecs);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    setPending(true);
    const specs =
      specsKey === null
        ? []
        : (JSON.parse(specsKey) as ExperimentMetricSpecInput[]);
    const experimentSdcpn = experimentSdcpnWithMetrics(sdcpn, specs);

    const analyze = async () => {
      try {
        const { artifacts } = await requestHirArtifacts(
          experimentSdcpn,
          extensions,
          { includeHir: true },
        );
        if (cancelled) {
          return;
        }
        const attached = attachMetricArtifacts(specs, artifacts);
        setReason(
          attached.ok
            ? summarizeGpuUnavailability(
                analyzeCompilation({
                  sdcpn: experimentSdcpn,
                  artifacts,
                  extensions,
                  metricSpecs: attached.specs,
                }),
              )
            : attached.reason,
        );
      } catch (caught) {
        if (!cancelled) {
          setReason(
            caught instanceof Error
              ? `The net could not be compiled: ${caught.message}`
              : "The net could not be compiled.",
          );
        }
      } finally {
        if (!cancelled) {
          setPending(false);
        }
      }
    };

    void analyze();

    return () => {
      cancelled = true;
    };
  }, [enabled, sdcpn, extensions, specsKey, requestHirArtifacts]);

  if (!enabled) {
    return { available: false, reason: null, pending: false };
  }
  if (pending) {
    return { available: false, reason: null, pending: true };
  }
  if (reason !== null) {
    return { available: false, reason, pending: false };
  }
  return { available: true, reason: null, pending: false };
};
