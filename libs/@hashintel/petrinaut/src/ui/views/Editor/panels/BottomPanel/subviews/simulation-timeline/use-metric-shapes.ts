import { use } from "react";

import { LanguageClientContext } from "../../../../../../../react/lsp/context";
import { useStoreSelector } from "../../../../../../../react/use-store";

import type { MetricShape } from "@hashintel/petrinaut-core";

/**
 * The shape of every metric of the net, by metric id, as the language
 * server classified them on its last check: discrete when the value moves
 * only at events, continuous when it follows dynamics between them. Empty
 * until the first check lands; a metric that does not lower is absent.
 */
export const useMetricShapes = (): Readonly<Record<string, MetricShape>> => {
  const { netAnalysis } = use(LanguageClientContext);
  return useStoreSelector(netAnalysis, (analysis) => analysis.metricShapes);
};
