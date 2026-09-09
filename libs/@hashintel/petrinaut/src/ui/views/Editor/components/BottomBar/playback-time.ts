/**
 * The playback readout's numbers: where the run has reached, and how far it
 * goes. Both are derived from the frame the viewer is on, because a frame is
 * how a run is stored, and neither is shown as a frame, because time is how a
 * run is read.
 */

export interface PlaybackTimes {
  /** Seconds from the start of the run to the frame on screen. */
  elapsed: number;
  /** Seconds from the start of the run to its last produced frame. */
  total: number;
}

export const playbackTimes = ({
  frameIndex,
  totalFrames,
  dt,
}: {
  frameIndex: number;
  totalFrames: number;
  dt: number;
}): PlaybackTimes => ({
  elapsed: frameIndex * dt,
  // The first frame sits at t=0, so a run of n frames ends at (n - 1) steps.
  total: Math.max(0, totalFrames - 1) * dt,
});

/**
 * Decimals worth printing for a run of this step size: every time in the run
 * is a multiple of `dt`, so more digits than the step carries are always zero.
 */
const decimalsForStep = (dt: number): number => {
  if (!Number.isFinite(dt) || dt <= 0) {
    return 3;
  }
  if (dt >= 0.1) {
    return 1;
  }
  if (dt >= 0.01) {
    return 2;
  }
  return 3;
};

/** `elapsed / total` for one run, in seconds, at the run's own precision. */
export const formatPlaybackTimes = (
  { elapsed, total }: PlaybackTimes,
  dt: number,
): { elapsed: string; total: string } => {
  const decimals = decimalsForStep(dt);
  return {
    elapsed: elapsed.toFixed(decimals),
    total: `${total.toFixed(decimals)}s`,
  };
};
