/**
 * The playback readout over an event-driven run: the viewed time and the time
 * the trace covers. Times are not multiples of a step, so both print at a
 * fixed precision.
 */

/** Decimals the readout prints: a millisecond is as fine as a step lands. */
const DECIMALS = 3;

export const formatEventPlaybackTimes = ({
  time,
  coveredTime,
}: {
  time: number;
  coveredTime: number;
}): { elapsed: string; total: string } => ({
  elapsed: time.toFixed(DECIMALS),
  total: coveredTime.toFixed(DECIMALS),
});
