/**
 * Coalesces `commitStructure` calls during a streaming-ingest burst.
 *
 * `entry.ts` ingests every INGEST_BATCH into the stores immediately (cheap,
 * incremental) but routes the expensive commit through this class instead of
 * committing per batch. A burst of batches sitting in the worker's message
 * queue then produces one commit: the first deferral posts a message to a
 * MessageChannel port, which the event loop delivers only after the already
 * queued worker messages drain (the same property {@link TickScheduler}
 * exploits). Batches separated by a real gap land in separate commits, so
 * progressive rendering is preserved.
 *
 * Latency policy:
 * - The first enqueue ever flushes synchronously, so a cold load's first
 *   visible structure is never held back by coalescing.
 * - A sustained stream that keeps the queue non-empty cannot starve the
 *   commit: the drain message caps deferral at one queue cycle, and two
 *   backstops bound pathological backlogs (a batch-count cap
 *   ({@link MAX_COALESCED_BATCHES}) and an age cap
 *   ({@link MAX_COALESCE_DELAY_MS}), both checked at enqueue time.
 *
 * Delta merging: per-group `delta`s sum; `previousCount` / `isNewGroup` keep
 * the values of the burst's first batch touching that group (stores are
 * add-only, so `count(flush) - previousCount(first) = Σ deltas`). A
 * `rebuildTree` request (new type registered mid-burst) becomes a flag on the
 * merged commit, applied exactly once. It subsumes the deltas in the
 * hierarchical tier (a tree rebuild reads the full stores).
 */
import type { TypeSetKey } from "../../ids";
import type { IngestDelta } from "../hierarchy/cluster-tree";

/** Options forwarded to {@link GraphWorker.commitStructure} on flush. */
export interface CoalescedCommit {
  readonly deltas: readonly IngestDelta[];
  readonly rebuildTree: boolean;
}

/**
 * Flush once this many batches are pending, even mid-burst. Bounds how much
 * a sustained stream batches into one commit (progressive rendering) and is
 * what paces commits in synchronous drivers (tests/benches) where the drain
 * message never gets to fire.
 */
export const MAX_COALESCED_BATCHES = 8;

/**
 * Flush when the oldest pending batch is older than this (checked at enqueue
 * time). A backstop for backlogs of few but slow-to-ingest batches, where the
 * batch-count cap would not trip; aligned with `FLAT_LOUVAIN_LINGER_MS`.
 */
export const MAX_COALESCE_DELAY_MS = 100;

interface MutableDelta {
  readonly groupKey: TypeSetKey;
  delta: number;
  readonly isNewGroup: boolean;
  readonly previousCount: number;
}

export interface CommitCoalescerDependencies {
  /** Runs the actual commit (and any post-commit work, e.g. root-flip restyle). */
  readonly commit: (opts: CoalescedCommit) => void;
  /** Injectable clock (tests). Defaults to `performance.now`. */
  readonly now?: () => number;
  /**
   * Injectable drain scheduling (tests). `schedule` is called at most once per
   * pending cycle and must eventually invoke `fire` on a later event-loop
   * turn. Defaults to a MessageChannel port message, which the event loop
   * delivers after the currently queued worker messages.
   */
  readonly scheduleDrain?: (fire: () => void) => void;
}

export class CommitCoalescer {
  readonly #commit: (opts: CoalescedCommit) => void;
  readonly #now: () => number;
  readonly #scheduleDrain: (fire: () => void) => void;

  /** Merged per-group deltas of the pending burst, in first-touched order. */
  readonly #pendingDeltas = new Map<TypeSetKey, MutableDelta>();
  #pendingRebuildTree = false;
  /** Enqueues since the last flush (a link-only batch has no deltas but still counts). */
  #pendingCount = 0;
  /** Clock reading of the first pending enqueue; undefined when nothing is pending. */
  #pendingSince: number | undefined;
  /** Whether a drain message is in flight (posted but not yet fired). */
  #drainArmed = false;
  /** First-ever enqueue flushes synchronously (bounded first-paint latency). */
  #everFlushed = false;

  constructor(dependencies: CommitCoalescerDependencies) {
    this.#commit = dependencies.commit;
    this.#now = dependencies.now ?? (() => performance.now());
    this.#scheduleDrain =
      dependencies.scheduleDrain ?? this.#defaultDrainScheduler();
  }

  get hasPending(): boolean {
    return this.#pendingCount > 0;
  }

  /**
   * Record one ingested batch's deltas (possibly empty (a link-only batch
   * still changes topology via the link count) and flush or defer per policy.
   */
  enqueueDeltas(deltas: readonly IngestDelta[]): void {
    for (const delta of deltas) {
      const merged = this.#pendingDeltas.get(delta.groupKey);

      if (merged) {
        merged.delta += delta.delta;
      } else {
        this.#pendingDeltas.set(delta.groupKey, { ...delta });
      }
    }

    this.#recordEnqueue();
  }

  /** Record a tree-rebuild request (new type registered) and flush or defer per policy. */
  enqueueRebuildTree(): void {
    this.#pendingRebuildTree = true;
    this.#recordEnqueue();
  }

  /**
   * Commit everything pending now. Called by the drain, by the enqueue-time
   * caps, and by `entry.ts` before any message that must observe the
   * committed state (viewport, queries, pin/highlight). No-op when idle.
   * Returns whether a commit ran.
   */
  flush(): boolean {
    if (this.#pendingCount === 0) {
      return false;
    }

    const commit: CoalescedCommit = {
      deltas: [...this.#pendingDeltas.values()],
      rebuildTree: this.#pendingRebuildTree,
    };

    this.#pendingDeltas.clear();
    this.#pendingRebuildTree = false;
    this.#pendingCount = 0;
    this.#pendingSince = undefined;
    this.#everFlushed = true;
    this.#commit(commit);
    return true;
  }

  #recordEnqueue(): void {
    this.#pendingCount += 1;
    this.#pendingSince ??= this.#now();

    if (!this.#everFlushed) {
      // Cold load: the first structure must not wait behind the burst.
      this.flush();
      return;
    }

    if (
      this.#pendingCount >= MAX_COALESCED_BATCHES ||
      this.#now() - this.#pendingSince >= MAX_COALESCE_DELAY_MS
    ) {
      this.flush();
      return;
    }

    if (!this.#drainArmed) {
      this.#drainArmed = true;
      this.#scheduleDrain(() => {
        this.#drainArmed = false;
        // A cap may have flushed already; flush() no-ops on an empty state.
        this.flush();
      });
    }
  }

  /**
   * The production drain: one MessageChannel whose port message is delivered
   * after the worker messages already queued at post time (i.e. after the
   * rest of the current ingest burst has been ingested and merged.
   */
  #defaultDrainScheduler(): (fire: () => void) => void {
    let channel: MessageChannel | undefined;
    let pendingFire: (() => void) | undefined;

    return (fire: () => void) => {
      if (!channel) {
        channel = new MessageChannel();
        channel.port1.onmessage = () => {
          const run = pendingFire;
          pendingFire = undefined;
          run?.();
        };
      }
      pendingFire = fire;
      channel.port2.postMessage(undefined);
    };
  }
}
