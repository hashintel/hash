/**
 * The failure a GPU experiment reports when a metric produced a non-finite
 * sample. The device halts the run and counts it per metric; the CPU
 * evaluator throws on the same value, so any count fails the experiment.
 * Seeds derive from the run index, so a run the probe prefix halted halts
 * again in the full run: checking the probe's counts reports the failure
 * after the prefix instead of after every run.
 */
export const metricFailure = ({
  metricIds,
  metricSpecs,
  metricErrors,
  runCount,
}: {
  /** The metrics in the order the device counts them. */
  metricIds: readonly string[];
  /** The specs the labels come from; a metric without one prints its id. */
  metricSpecs: readonly { id: string; label: string }[];
  /** Runs halted by a non-finite sample, per metric in `metricIds` order. */
  metricErrors: readonly number[];
  /** The runs the attempt executed, for the message's denominator. */
  runCount: number;
}): string | null => {
  const erroredMetric = metricErrors.findIndex((runs) => runs > 0);
  if (erroredMetric === -1) {
    return null;
  }
  const metricId = metricIds[erroredMetric];
  const label =
    metricSpecs.find((spec) => spec.id === metricId)?.label ?? metricId;
  return `Metric "${label}" returned a non-finite value in ${metricErrors[erroredMetric]} of ${runCount} runs, expected a finite number.`;
};
