import { Logger } from "./logger";

export type Signal = "SIGINT" | "SIGTERM" | "SIGKILL";

type CleanupProcedure = {
  name: string;
  cleanup: () => Promise<void> | void;
};

export class GracefulShutdown {
  private logger: Logger;
  private alreadyShutdown = false;
  private cleanupProcedures: CleanupProcedure[] = [];

  /**
   * `GracefulShutdown` is used to perform a graceful shutdown operation. On receiving
   * one of the OS signals in `signals`, it executes each cleanup procedure added to
   * the instance using the `addCleanup` method. The order of execution is the reverse
   * of the order in which the procedures were added. */
  constructor(logger: Logger, ...signals: Signal[]) {
    this.logger = logger;
    for (const signal of signals) {
      process.on(signal, () => {
        void this.trigger();
      });
    }
  }

  /** Add a cleanup procedure to this instance. */
  addCleanup(name: string, cleanup: () => void | Promise<void>) {
    this.cleanupProcedures.push({ name, cleanup });
  }

  /** Manually trigger the shutdown procedure. */
  async trigger() {
    if (this.alreadyShutdown) {
      return;
    }
    this.logger.debug("Running graceful shutdown procedures");
    this.alreadyShutdown = true;
    let wasError = false;
    for (const { name, cleanup } of this.cleanupProcedures.reverse()) {
      try {
        this.logger.debug(`Cleaning up ${name}`);
        await cleanup();
        this.logger.debug(`${name} cleaned up`);
      } catch (err) {
        wasError = true;
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- error stringification may need improvement
        this.logger.error(`cleaning up ${name}: ${err}`);
      }
    }
    if (wasError) {
      this.logger.error(
        "There were errors during the shutdown procedure. Please check the logs.",
      );
      process.exit(1);
    }
    this.logger.debug("Shutdown successful");
    process.exit(0);
  }

  isTriggered() {
    return this.alreadyShutdown;
  }
}
