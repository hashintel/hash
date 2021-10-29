/** Wait for `ms` milliseconds. */
export const waitFor = (ms: number) =>
  new Promise<"TIMEOUT">((resolve) => setTimeout(() => resolve("TIMEOUT"), ms));

export class Repeater {
  private stopRequested = false;

  /** `Repeater` repeatedly calls a callback function until it returns `true`, or
   * until its `stop` method is called.
   */
  constructor(private cb: () => Promise<boolean>) {}

  /** Start the Repeater. */
  async start(): Promise<void> {
    while (!this.stopRequested) {
      const res = await this.cb();
      if (res) {
        return;
      }
    }
  }

  /** Manually stop the Repeater. */
  stop() {
    this.stopRequested = true;
  }
}
