import { use, useEffect, useState } from "react";

import { sanitizeSDCPNForExtensions } from "@hashintel/petrinaut-core";
import { fingerprintHirCompilationInput } from "@hashintel/petrinaut-core/hir-runtime";

import { LanguageClientContext } from "../../../../../../../react/lsp/context";
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";

import type { MetricShape } from "@hashintel/petrinaut-core";

const NO_SHAPES: ReadonlyMap<string, MetricShape> = new Map();

/**
 * The inferred shape of every metric of the net, by metric id: discrete when
 * its value moves only at events, continuous when it follows dynamics
 * between them. Compiled once per version of the net; empty until then, and
 * a metric that does not compile stays absent.
 */
export const useMetricShapes = (): ReadonlyMap<string, MetricShape> => {
  const { requestHirArtifacts } = use(LanguageClientContext);
  const { petriNetDefinition, extensions } = use(SDCPNContext);
  const metrics = petriNetDefinition.metrics ?? [];
  const key =
    metrics.length === 0
      ? null
      : fingerprintHirCompilationInput(
          sanitizeSDCPNForExtensions(petriNetDefinition, extensions),
          extensions,
        );
  const [state, setState] = useState<{
    key: string | null;
    shapes: ReadonlyMap<string, MetricShape>;
  }>({ key: null, shapes: NO_SHAPES });

  useEffect(() => {
    if (key === null) {
      return;
    }
    let cancelled = false;
    requestHirArtifacts(petriNetDefinition, extensions)
      .then(({ artifacts }) => {
        if (cancelled) {
          return;
        }
        setState({
          key,
          shapes: new Map(
            Object.entries(artifacts.metrics).map(([id, artifact]) => [
              id,
              artifact.shape,
            ]),
          ),
        });
      })
      .catch(() => {
        // A net that does not compile has no shapes to offer; the picker
        // lists its metrics ungrouped.
      });
    return () => {
      cancelled = true;
    };
  }, [extensions, key, petriNetDefinition, requestHirArtifacts]);

  return state.key === key ? state.shapes : NO_SHAPES;
};
