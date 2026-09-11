import { use, useEffect, useState } from "react";

import {
  analyzeCompilation,
  summarizeGpuUnavailability,
  toGpuMetricSpecs,
} from "@hashintel/petrinaut-core/webgpu";

import { LanguageClientContext } from "../../../../../../react/lsp/context";

import type { ExperimentMetricSpecInput } from "../../../../../../react/experiments/context";
import type {
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
 * Whether the GPU backend could run a compute request over this net with
 * these metrics, and the reason when it could not.
 *
 * The net is analysed asynchronously (lowering user code happens in the
 * language worker) but the metric gate is evaluated synchronously from the
 * specs, so editing a metric updates the answer without another round-trip.
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
  const [netReason, setNetReason] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    setPending(true);

    const analyze = async () => {
      try {
        const { artifacts } = await requestHirArtifacts(sdcpn, extensions, {
          includeHir: true,
        });
        if (cancelled) {
          return;
        }
        setNetReason(
          summarizeGpuUnavailability(
            analyzeCompilation({ sdcpn, artifacts, extensions }),
          ),
        );
      } catch (caught) {
        if (!cancelled) {
          setNetReason(
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
  }, [enabled, sdcpn, extensions, requestHirArtifacts]);

  if (!enabled) {
    return { available: false, reason: null, pending: false };
  }
  if (pending) {
    return { available: false, reason: null, pending: true };
  }
  if (netReason !== null) {
    return { available: false, reason: netReason, pending: false };
  }

  // Expression metrics are computed from full simulation state, which the GPU
  // path never materialises on the host, so they rule the backend out before the
  // histogram gate is worth consulting. Narrowing as we go also gives
  // `toGpuMetricSpecs` the compiled-spec type it wants without a cast: only
  // expression specs lack an `artifact`.
  const histogramSpecs: MonteCarloMetricSpec[] = [];
  for (const spec of metricSpecs ?? []) {
    if (spec.kind === "expression") {
      return {
        available: false,
        reason: `Metric "${spec.label}" is an expression metric, which the GPU backend cannot compute. Use place token-count metrics to run on the GPU.`,
        pending: false,
      };
    }
    histogramSpecs.push(spec);
  }

  if (histogramSpecs.length > 0) {
    const gpuMetrics = toGpuMetricSpecs(histogramSpecs);
    if (!gpuMetrics.ok) {
      return { available: false, reason: gpuMetrics.reason, pending: false };
    }
  }

  return { available: true, reason: null, pending: false };
};
