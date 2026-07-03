/**
 * MessageChannel-based deferral primitives for the worker's event loop.
 *
 * Both classes exploit the same property: posting to a MessageChannel port
 * schedules a macro task that yields to the event loop (so incoming worker
 * messages get processed between runs) without the ~4ms setTimeout floor.
 */

/**
 * Drives a repeated tick callback, one macro task per tick, until the host
 * reports there is nothing left to animate.
 *
 * The host calls {@link ensureRunning} whenever it (re)starts a layout and
 * {@link stop} from inside the tick when everything has settled; a stopped
 * scheduler simply does not re-post, so `ensureRunning` is always safe to
 * call again.
 */
export class TickScheduler {
  readonly #channel = new MessageChannel();
  #running = false;
  #paused = false;

  constructor(tick: () => void) {
    this.#channel.port1.onmessage = () => {
      if (this.#paused) {
        return;
      }

      tick();

      if (this.#running) {
        this.#scheduleNextTick();
      }
    };
  }

  get running(): boolean {
    return this.#running;
  }

  get paused(): boolean {
    return this.#paused;
  }

  ensureRunning(): void {
    if (this.#paused) {
      return;
    }

    if (!this.#running) {
      this.#running = true;
      this.#scheduleNextTick();
    }
  }

  /** Idempotent: stops scheduling further ticks once every layout has settled. */
  stop(): void {
    this.#running = false;
  }

  pause(): void {
    this.#paused = true;
  }

  resume(): void {
    this.#paused = false;

    if (this.#running) {
      this.#scheduleNextTick();
    }
  }

  #scheduleNextTick(): void {
    if (this.#paused) {
      return;
    }

    this.#channel.port2.postMessage(undefined);
  }
}

/**
 * One-shot background jobs (e.g. cluster naming), one job per macro task, so
 * a job that scans every member's properties never blocks the commit that
 * just rendered the clusters, and each job yields to the event loop
 * (incoming messages, the prior commit's paint) before the next runs.
 */
export class JobScheduler {
  readonly #channel = new MessageChannel();
  readonly #jobs: Array<() => void> = [];
  #paused = false;

  constructor() {
    this.#channel.port1.onmessage = () => {
      if (this.#paused) {
        return;
      }

      this.#jobs.shift()?.();

      if (this.#jobs.length > 0) {
        this.#channel.port2.postMessage(undefined);
      }
    };
  }

  pause(): void {
    this.#paused = true;
  }

  resume(): void {
    this.#paused = false;

    if (this.#jobs.length > 0) {
      this.#channel.port2.postMessage(undefined);
    }
  }

  schedule(job: () => void): void {
    this.#jobs.push(job);
    if (this.#jobs.length === 1) {
      this.#channel.port2.postMessage(undefined);
    }
  }
}
