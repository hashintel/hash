/**
 * One probe per marking, however many batches start on it at once.
 *
 * The ladder pipelines its rungs off the first streamed chunk, and the first
 * chunk a fresh marking streams is its probe's — so the next rung starts
 * while the calibration it could reuse is still being measured. The batch
 * that probes claims the key; batches arriving meanwhile wait for its
 * settle and read the stored calibration instead of probing too. When the
 * settle stored none, the waiters look the key up again: the first finds it
 * free and claims, the others find that claim and wait on it.
 */
export type CalibrationShare = {
  /** Another batch's probe of this key, settled once it stored or gave up. */
  inFlight: Promise<void> | undefined;
  /**
   * Registers this batch as the one probing the key. The returned settle is
   * idempotent and releases the waiters; call it once the calibration is
   * stored, and again from a `finally` so a failed or cancelled probe
   * releases them too.
   */
  claim: () => () => void;
};

export const shareCalibration = (
  calibrating: Map<string, Promise<void>>,
  key: string,
): CalibrationShare => ({
  inFlight: calibrating.get(key),
  claim: () => {
    let release = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    calibrating.set(key, pending);
    return () => {
      if (calibrating.get(key) === pending) {
        calibrating.delete(key);
      }
      release();
    };
  },
});
