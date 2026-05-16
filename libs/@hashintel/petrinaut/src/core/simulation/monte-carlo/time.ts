/**
 * Derives simulation time from frame counts instead of incrementally adding
 * `dt`, which keeps long Monte Carlo runs from accumulating floating-point
 * rounding drift.
 */
export function getFrameTime(frameNumber: number, dt: number): number {
  return frameNumber * dt;
}

/**
 * Computes the first frame number at or beyond maxTime.
 *
 * If maxTime is an integer multiple of dt, small binary floating-point division
 * errors should not push the limit one frame later.
 */
export function getMaxFrameNumber(maxTime: number, dt: number): number {
  const frameCount = maxTime / dt;
  const roundedFrameCount = Math.round(frameCount);
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(frameCount)) * 16;

  if (Math.abs(frameCount - roundedFrameCount) <= tolerance) {
    return roundedFrameCount;
  }

  return Math.ceil(frameCount);
}
