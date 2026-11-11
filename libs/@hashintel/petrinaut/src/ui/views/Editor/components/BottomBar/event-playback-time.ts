import { formatRunPosition } from "../../shared/run-position";

import type { RunClock } from "@hashintel/petrinaut-core";

/**
 * The playback readout over a run: the viewed position and the position
 * the trace covers, in seconds or in steps as the run's clock counts.
 */
export const formatEventPlaybackTimes = ({
  clock,
  time,
  coveredTime,
}: {
  clock: RunClock;
  time: number;
  coveredTime: number;
}): { elapsed: string; total: string } => ({
  elapsed: formatRunPosition(clock, time),
  total: formatRunPosition(clock, coveredTime),
});
