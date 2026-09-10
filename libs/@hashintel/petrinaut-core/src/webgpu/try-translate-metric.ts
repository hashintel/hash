/**
 * Asks whether a metric body could be translated to WGSL, and whether its
 * value is a whole number.
 *
 * This runs the same sample emitter `compile-net-shader.ts` uses, bound to
 * placeholder places instead of the real layout, so it needs no device and
 * no shader. The metric gate, the compilation report and the editor's GPU
 * switch all read this one probe, which is why they give the same reason for
 * the same metric.
 *
 * `integer` comes from the typechecker's static return type: `count`,
 * `.length`, integer literals and `+ - * %` over them stay `int`, `/` and
 * `**` make a `real`, a conditional joins its arms and a reduce joins its
 * seed with its body. An integer metric keeps exact bin labels on the device.
 */
import { buildMetricContext } from "../hir/surface-context";
import { typecheckHir } from "../hir/typecheck";
import { resolveNetParameterValues } from "../parameter-values";
import {
  emitMetricSample,
  metricStateValue,
  probePlaceBindings,
} from "./compile-net-shader";
import { WgslBailError } from "./emit-wgsl";

import type { PetrinautExtensionSettings } from "../extensions";
import type { HirFunction } from "../hir/hir";
import type { SDCPN } from "../types/sdcpn";

export type MetricTranslationResult =
  | {
      translatable: true;
      /** The body's static return type is `int`. */
      integer: boolean;
    }
  | { translatable: false; reason: string };

export const tryTranslateMetric = ({
  sdcpn,
  hir,
  extensions,
  parameterValues,
}: {
  sdcpn: SDCPN;
  hir: HirFunction;
  extensions?: PetrinautExtensionSettings;
  /**
   * Resolved parameter values. Defaults to the net's own declared defaults,
   * as the kernel probe does: the shader inlines parameters as literals, so
   * an absent one fails emission with `unknown parameter ...`, which would
   * read as the metric's fault.
   */
  parameterValues?: Readonly<Record<string, number | boolean>>;
}): MetricTranslationResult => {
  const context = buildMetricContext(sdcpn, extensions);
  try {
    emitMetricSample(hir, {
      state: metricStateValue(probePlaceBindings(context)),
      parameterValues:
        parameterValues ??
        resolveNetParameterValues(
          sdcpn.parameters,
          {},
          extensions?.parameters ?? true,
        ),
      identifierScope: "probe_",
    });
  } catch (error) {
    if (error instanceof WgslBailError) {
      return { translatable: false, reason: error.message };
    }
    throw error;
  }
  return {
    translatable: true,
    integer: typecheckHir(hir, context).returnType.kind === "int",
  };
};
