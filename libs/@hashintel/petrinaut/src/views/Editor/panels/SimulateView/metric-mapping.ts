import type { Metric } from "../../../../core/types/sdcpn";
import type { MetricFormState } from "./metric-form";

/**
 * Build a `Metric` from the form state.
 *
 * @param state - the form state
 * @param id - the metric id (use a new UUID for new metrics, the existing
 *   metric's id when updating)
 */
export function buildMetricFromFormState(
  state: MetricFormState,
  id: string,
): Metric {
  return {
    id,
    name: state.name.trim(),
    description: state.description.trim() || undefined,
    code: state.code,
  };
}
