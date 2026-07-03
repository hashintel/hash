import { EntityPositionBuffer } from "../buffers/position-buffer";

import type { Position } from "../../geometry";
/**
 * Shared mechanics for a SharedArrayBuffer-backed d3-force simulation:
 * position storage, time-budgeted ticking, settle detection, and circular
 * confinement. The forces differ per use and are configured by the dedicated
 * factory ({@link "./entity-layout"}); this base only owns what they have in
 * common. This engine backs entity-dot layouts; cluster/macro layout uses
 * WebCola in {@link "./cluster-layout"}.
 *
 * Positions are local to the parent (centered at 0,0); the caller translates to
 * world coords using the parent's position. Worker writes positions then
 * Atomics-increments the version in the SharedArrayBuffer; main thread polls
 * the version to decide GPU re-upload (no lock; monotonic counter).
 */
import type { Force, Simulation, SimulationNodeDatum } from "d3-force";

export { sharedBufferAvailable } from "../buffers/growable-buffer";

export interface ForceNode extends SimulationNodeDatum {
  readonly id: string;
  readonly radius: number;
}

export interface ForceEdge {
  source: string | ForceNode;
  target: string | ForceNode;
  readonly weight: number;
}

export type ForceLayoutStatus = "running" | "paused" | "settled";

/**
 * A fixed external-port anchor for a sub-cluster layout. The anchor is pinned to
 * the parent rim in the direction of an external neighbour; the children that
 * connect through it are linked to it, so the layout sorts them toward their
 * real external connections (WebCola constraint, only the cluster layout
 * supports it).
 *
 * Position relative to the parent layout's local frame.
 */
export interface PortAnchor extends Position {
  /**
   * Children linked to this port: index into the layout's nodes + the pull
   * weight (proportional to the edge count to this port, so heavily-connected
   * children are held to their port more firmly than weakly-connected ones).
   */
  readonly children: readonly {
    readonly index: number;
    readonly weight: number;
  }[];
}

/**
 * Common tick/pause/resume/buffer contract shared by WebCola cluster layouts
 * and d3-force entity layouts ({@link ForceSimulation}); the worker drives any
 * layout engine through this surface alone.
 */
export interface LayoutSimulation {
  readonly status: ForceLayoutStatus;
  readonly isSettled: boolean;
  readonly nodes: readonly ForceNode[];
  readonly buffer: SharedArrayBuffer | ArrayBuffer;
  readonly nodeIds: string[];
  readonly alpha: number;
  /** Louvain community id per node in buffer order (community-force layout only). */
  readonly communities?: readonly number[];

  /**
   * Advance up to `budgetMs` of simulation work. Returns whether node
   * positions were committed (published) during this call; the worker gates
   * frame emission on it, so an engine that advances internally without
   * moving published positions MUST return false for those ticks (emitting
   * anyway rebuilds all edge geometry for an unchanged picture).
   * Liveness/termination is `isSettled`, never this return value.
   */
  tick(budgetMs: number): boolean;
  pause(): void;
  resume(): void;
  /**
   * Incrementally absorb newly-arrived nodes without a restart (community-force
   * majorization engine only): append them (pre-seeded near their neighbours),
   * rebuild edge topology from `edges` (the full current set), and keep iterating
   * from current positions. cola can't (its Descent is a fixed N*N solve), so the
   * flat-force tier omits this and rebuilds (warm-seeded) instead.
   */
  absorb?(newNodes: ForceNode[], edges: ForceEdge[]): void;
  /** Write a node's rgba colour into the buffer (entity-dot leaves carry per-node colour). */
  setNodeColor?(
    index: number,
    color: readonly [number, number, number, number],
  ): void;
  /** Publish colour writes -- bumps the version so the main thread re-uploads. */
  commitColors?(): void;
  /**
   * Force a community (Louvain) refresh if any nodes were absorbed since the last
   * one; returns whether it ran. Position-neutral. The worker calls this on a
   * trailing debounce (stream goes quiet) so membership reflects the final graph.
   */
  refreshCommunities?(): boolean;
  /** Re-run with fixed external-port anchors (cluster layout only). */
  setPortAnchors?(anchors: readonly PortAnchor[]): void;
  /**
   * Move existing port anchors in place (no re-run). A running layout re-aims
   * its children toward them; a settled layout ignores the writes.
   */
  updateAnchorPositions?(positions: readonly Position[]): void;
}

/**
 * Freeze a layout once its energy drops to here (see
 * {@link "./entity-layout-config"} `settleAlpha` for the tuning rationale).
 * Fallback when the caller doesn't pass a threshold.
 */
const DEFAULT_SETTLE_ALPHA = 0.001;

/**
 * Custom d3 force that confines nodes inside a circle. Runs as part of the
 * simulation tick (adjusts velocities) rather than as a post-processing step,
 * so it interacts correctly with the other forces.
 */
export function forceConfine(radius: number): Force<ForceNode, undefined> {
  let nodes: ForceNode[] = [];

  const force: Force<ForceNode, undefined> = () => {
    for (const node of nodes) {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const dist = Math.hypot(x, y);
      const boundary = Math.max(0, radius * 0.98 - node.radius);

      if (boundary <= 0) {
        node.vx = -(node.x ?? 0) * 0.5;
        node.vy = -(node.y ?? 0) * 0.5;
      } else if (dist > boundary) {
        const overshoot = dist - boundary;
        const strength = 0.3 + 0.7 * Math.min(1, overshoot / radius);
        node.vx = (node.vx ?? 0) - (x / dist) * overshoot * strength;
        node.vy = (node.vy ?? 0) - (y / dist) * overshoot * strength;
      }
    }
  };

  force.initialize = (newNodes: ForceNode[]) => {
    nodes = newNodes;
  };

  return force;
}

/**
 * Drives a stopped d3 simulation under a time budget, writing re-centred local
 * positions into an {@link EntityPositionBuffer} each tick.
 */
export class ForceSimulation implements LayoutSimulation {
  readonly #simulation: Simulation<ForceNode, ForceEdge>;
  readonly #nodes: ForceNode[];
  readonly #confinementRadius: number | undefined;
  readonly #positionBuffer: EntityPositionBuffer;
  readonly #settleAlpha: number;
  #status: ForceLayoutStatus;

  constructor(
    nodes: ForceNode[],
    simulation: Simulation<ForceNode, ForceEdge>,
    confinementRadius?: number,
    settleAlpha: number = DEFAULT_SETTLE_ALPHA,
  ) {
    this.#nodes = nodes;
    this.#confinementRadius = confinementRadius;
    this.#settleAlpha = settleAlpha;
    this.#status = "running";
    this.#positionBuffer = new EntityPositionBuffer(nodes.length);
    this.#writePositions();

    this.#simulation = simulation;
    if (confinementRadius !== undefined) {
      this.#simulation.force("confine", forceConfine(confinementRadius));
    }
  }

  get status(): ForceLayoutStatus {
    return this.#status;
  }

  get isSettled(): boolean {
    return this.#status === "settled";
  }

  get nodes(): readonly ForceNode[] {
    return this.#nodes;
  }

  get alpha(): number {
    return this.#simulation.alpha();
  }

  /** The raw buffer backing positions. SharedArrayBuffer when available. */
  get buffer(): SharedArrayBuffer | ArrayBuffer {
    return this.#positionBuffer.raw;
  }

  /** Node IDs in buffer order. Sent once to the main thread on creation. */
  get nodeIds(): string[] {
    return this.#nodes.map((node) => node.id);
  }

  /**
   * Advances the simulation until alpha falls below the settle threshold or
   * the `budgetMs` time budget elapses; returns whether any tick ran and
   * positions were committed.
   */
  tick(budgetMs: number): boolean {
    if (this.#status === "settled") {
      return false;
    }

    this.#status = "running";
    const start = performance.now();
    let ticked = false;

    while (
      performance.now() - start < budgetMs &&
      this.#simulation.alpha() > this.#settleAlpha
    ) {
      this.#simulation.tick();
      if (this.#confinementRadius !== undefined) {
        this.#clampPositions();
      }
      ticked = true;
    }

    if (ticked) {
      this.#writePositions();
    }

    if (this.#simulation.alpha() <= this.#settleAlpha) {
      this.#status = "settled";
    }

    return ticked;
  }

  pause(): void {
    if (this.#status === "running") {
      this.#status = "paused";
    }
  }

  resume(): void {
    if (this.#status !== "running") {
      this.#status = "running";
      this.#simulation.alpha(0.3).restart().stop();
    }
  }

  #writePositions(): void {
    for (let idx = 0; idx < this.#nodes.length; idx++) {
      const node = this.#nodes[idx]!;
      this.#positionBuffer.setPosition(idx, node.x ?? 0, node.y ?? 0);
    }
    this.#positionBuffer.commit();
  }

  /** Write node `index`'s rgba colour into the buffer (the worker knows the colour). */
  setNodeColor(
    index: number,
    color: readonly [number, number, number, number],
  ): void {
    this.#positionBuffer.setColor(index, color);
  }

  /** Publish colour writes (bumps the version so the main thread re-uploads). */
  commitColors(): void {
    this.#positionBuffer.commit();
  }

  #clampPositions(): void {
    // #clampPositions is only called from tick when confinementRadius was set
    // in the constructor.
    const maxR = this.#confinementRadius!;

    for (const node of this.#nodes) {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const dist = Math.hypot(x, y);
      const boundary = Math.max(0, maxR * 0.98 - node.radius);

      if (dist > boundary && dist > 0) {
        const scale = boundary / dist;
        node.x = x * scale;
        node.y = y * scale;
      }
    }
  }
}
