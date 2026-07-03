/**
 * Whole-frame GPU elapsed-time sampling via `EXT_disjoint_timer_query_webgl2`.
 *
 * Deck reports `gpuTimePerFrame: 0` because nothing wires the WebGL timer
 * extension, which leaves the GPU side of a hitch invisible: a long rAF
 * interval with an idle main thread could be fragment load, pipeline
 * back-pressure, or the compositor. This timer brackets each Deck redraw
 * (`onBeforeRender`/`onAfterRender`) with a `TIME_ELAPSED_EXT` query, giving
 * the GPU-side execution time of that frame's draw commands. It does NOT
 * include compositing/present -- but "91 ms frame, 80 ms GPU draw time" vs
 * "91 ms frame, 2 ms GPU draw time" is exactly the fork the render bench
 * needs to attribute a stall.
 *
 * Query results are asynchronous (typically ready 1-3 frames later), so
 * completed samples are polled at each subsequent frame start and reported
 * through a callback together with the submit-time timestamp -- the sample
 * lines up with the frame that PRODUCED it, not the frame where the result
 * arrived. Availability is a runtime question (the extension is commonly
 * missing on macOS Chrome, where ANGLE runs over Metal): {@link available}
 * stays `null` until the first frame probes the context, then reports what
 * the platform gave us.
 */

/** The extension object: two GLenums beyond the WebGL2 query API. */
interface TimerExtension {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

interface PendingQuery {
  readonly query: WebGLQuery;
  readonly submittedAtMs: number;
}

/** Receives one completed sample per timed frame, in submit order. */
export type GpuSampleSink = (submittedAtMs: number, durationMs: number) => void;

/** Notified when a disjoint event discards the in-flight queries. */
export type GpuDisjointSink = () => void;

const NANOSECONDS_PER_MILLISECOND = 1e6;

export class GpuFrameTimer {
  #gl: WebGL2RenderingContext | null = null;
  #extension: TimerExtension | null = null;
  #probed = false;
  #active: WebGLQuery | null = null;
  #pending: PendingQuery[] = [];
  #pool: WebGLQuery[] = [];

  readonly #onSample: GpuSampleSink;
  readonly #onDisjoint: GpuDisjointSink;
  readonly #clock: () => number;

  constructor(
    onSample: GpuSampleSink,
    onDisjoint: GpuDisjointSink,
    clock: () => number = () => performance.now(),
  ) {
    this.#onSample = onSample;
    this.#onDisjoint = onDisjoint;
    this.#clock = clock;
  }

  /** `null` until the first {@link frameBegin} probes the context. */
  get available(): boolean | null {
    return this.#probed ? this.#extension !== null : null;
  }

  /**
   * Bracket start: poll finished queries, then begin timing this frame.
   * Call only for frames that should be sampled (capture gating lives with
   * the caller); un-sampled frames still deliver pending results on the
   * next sampled one.
   */
  frameBegin(gl: WebGL2RenderingContext): void {
    if (!this.#probed) {
      this.#probed = true;
      this.#gl = gl;
      this.#extension = gl.getExtension(
        "EXT_disjoint_timer_query_webgl2",
      ) as TimerExtension | null;
    }

    if (this.#extension === null || this.#gl === null) {
      return;
    }

    this.poll();
    if (this.#active !== null) {
      // Unbalanced begin (a lost frameEnd); close it out rather than throw.
      this.#endActive();
    }

    const query = this.#pool.pop() ?? this.#gl.createQuery();
    this.#gl.beginQuery(this.#extension.TIME_ELAPSED_EXT, query);
    this.#pending.push({ query, submittedAtMs: this.#clock() });
    this.#active = query;
  }

  /** Bracket end; a no-op when the matching begin never started a query. */
  frameEnd(): void {
    if (this.#active !== null) {
      this.#endActive();
    }
  }

  #endActive(): void {
    this.#gl?.endQuery(this.#extension!.TIME_ELAPSED_EXT);
    this.#active = null;
  }

  /**
   * Drain completed queries into the sample sink. Results complete in
   * submit order, so polling stops at the first unavailable one. A disjoint
   * event (GPU context churn) invalidates every in-flight measurement;
   * those queries are discarded wholesale and the disjoint sink is told.
   */
  poll(): void {
    const gl = this.#gl;
    const extension = this.#extension;
    if (gl === null || extension === null || this.#pending.length === 0) {
      return;
    }

    if (gl.getParameter(extension.GPU_DISJOINT_EXT) === true) {
      for (const { query } of this.#pending) {
        if (query !== this.#active) {
          this.#pool.push(query);
        }
      }
      this.#pending = this.#active === null ? [] : this.#pending.slice(-1);
      this.#onDisjoint();
      return;
    }

    let completed = 0;
    for (const { query, submittedAtMs } of this.#pending) {
      if (query === this.#active) {
        break;
      }
      if (gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) !== true) {
        break;
      }
      const nanoseconds = gl.getQueryParameter(
        query,
        gl.QUERY_RESULT,
      ) as number;
      this.#onSample(submittedAtMs, nanoseconds / NANOSECONDS_PER_MILLISECOND);
      this.#pool.push(query);
      completed += 1;
    }

    if (completed > 0) {
      this.#pending.splice(0, completed);
    }
  }
}
