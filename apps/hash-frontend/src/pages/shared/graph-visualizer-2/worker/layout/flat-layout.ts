/**
 * The flat-tier layout: one stress-minimised embedding of the whole entity set,
 * used by `flat-force` and `community-force` (the individual-entity regime, see
 * `LAYOUT-MODES.md`). This is not the cluster (macro) layout: there are no
 * containers, no ports, every node is an individual entity.
 *
 * We drive WebCola's `Descent` solver directly rather than via its `Layout`
 * class. `Layout.start()` runs its phases (unconstrained stress -> overlap) to
 * completion synchronously; that fights our model, where every step must go
 * through the event-queue scheduler and stream to the SharedArrayBuffer. So we
 * own the sequencing and stage the phases across `tick()` calls:
 *
 *  - Phase A (unconstrained stress majorisation): `descent.project = null`; step
 *    `rungeKutta()` until stress converges. cola unfolds the graph by pure
 *    stress, link communities separating spatially (jaccard-weighted ideal link
 *    lengths). Disconnected pairs have an infinite ideal distance, which cola's
 *    gradient treats as zero force (harmless), so components drift freely here.
 *  - Pack: `separateGraphs` + `applyPacking` arrange the (now-settled) connected
 *    components compactly, the geometric step the stress phase can't do.
 *  - Phase B (VPSC non-overlap): `descent.project = Projection(...).projectFunctions()`
 *    with `avoidOverlaps`; step `rungeKutta()` for a fixed iteration budget. Not
 *    "until stress converges", VPSC is nearly stress-neutral, so a convergence
 *    test quits before overlap is resolved (this is how `Layout` does it too).
 *
 * Every step writes the shared buffer and is published, so the whole settling
 * streams. cola owns every position throughout, we never mutate its node
 * coordinates behind its back (doing so corrupts its descent + VPSC state and
 * piles nodes up).
 */
import {
  Calculator,
  Descent,
  Projection,
  applyPacking,
  jaccardLinkLengths,
  separateGraphs,
} from "webcola";

import type { FlatGraphBuffer } from "../buffers/position-buffer";
import type {
  ForceEdge,
  ForceLayoutStatus,
  ForceNode,
  LayoutSimulation,
} from "./force-simulation";

/** Base ideal link length (world units); jaccardLinkLengths scales it by structure. */
const IDEAL_LINK_LENGTH = 40;
/** jaccardLinkLengths weighting: how strongly neighbourhood overlap warps lengths. */
const JACCARD_WEIGHT = 1;
/** Non-overlap padding around each dot, in world units. */
const NODE_PAD = 3;
/** Stress-convergence threshold for Phase A (cola's own default ratio test). */
const CONVERGENCE_THRESHOLD = 0.01;
/** Phase B (overlap): run a guaranteed base of iterations to get past VPSC's
 * early stress-neutral steps (where a convergence test trips immediately), then
 * switch to displacement-convergence (keep descending until the layout floors,
 * stable), bounded by a high safety cap. We're in the worker streaming through
 * the queue, so the extra iterations cost the UI nothing. */
const OVERLAP_MIN_ITERS = 40;
const OVERLAP_MAX_ITERS = 400;
/** Phase A safety cap: bound the unconstrained stress phase like cola's run().
 * rungeKutta() returns displacement, which ->0 at settle, so the ratio test never
 * trips and the cap is what guarantees termination. */
const STRESS_MAX_ITERS = 200;
/** Fallback node size (world units) for the disconnected-component packing. */
const PACK_NODE_SIZE = 16;

/**
 * A node as cola's `Projection` / packing read it: positions (rebuilt into
 * `bounds` by the projection each step) + the box used for non-overlap.
 */
interface ColaNode {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Index-based link (its jaccard length is kept in a side map, not on the link). */
interface ColaLink {
  readonly source: number;
  readonly target: number;
}

/** Object-endpoint link for `separateGraphs` (it reads `source.index`). */
interface ColaObjectLink {
  source: ColaNode;
  target: ColaNode;
}

type FlatPhase = "stress" | "pack" | "overlap" | "done";

class FlatLayout implements LayoutSimulation {
  readonly #nodes: ForceNode[];
  readonly #colaNodes: ColaNode[];
  readonly #objectLinks: ColaObjectLink[];
  readonly #rootGroup: { leaves: ColaNode[]; groups: never[]; padding: number };
  readonly #descent: Descent;
  /** Weight matrix (default 2 = push-apart-only; 1 for edges). Attached for the
   * overlap phase only, exactly as `Layout.start` does. */
  readonly #weights: number[][];
  readonly #buffer: FlatGraphBuffer;
  #status: ForceLayoutStatus;
  #phase: FlatPhase;
  #prevDisp = Number.MAX_VALUE;
  #stressSteps = 0;
  #overlapSteps = 0;

  constructor(nodes: ForceNode[], edges: ForceEdge[], buffer: FlatGraphBuffer) {
    this.#nodes = nodes;
    this.#buffer = buffer;
    const count = nodes.length;

    const idToIndex = new Map<string, number>();
    for (const [index, node] of nodes.entries()) {
      idToIndex.set(node.id, index);
    }

    this.#colaNodes = nodes.map((node, index) => ({
      index,
      x: node.x ?? 0,
      y: node.y ?? 0,
      width: (node.radius + NODE_PAD) * 2,
      height: (node.radius + NODE_PAD) * 2,
    }));

    const links: ColaLink[] = [];
    this.#objectLinks = [];
    for (const edge of edges) {
      const sourceId =
        typeof edge.source === "string" ? edge.source : edge.source.id;
      const targetId =
        typeof edge.target === "string" ? edge.target : edge.target.id;
      const sourceIndex = idToIndex.get(sourceId);
      const targetIndex = idToIndex.get(targetId);
      if (
        sourceIndex !== undefined &&
        targetIndex !== undefined &&
        sourceIndex !== targetIndex
      ) {
        links.push({ source: sourceIndex, target: targetIndex });
        this.#objectLinks.push({
          source: this.#colaNodes[sourceIndex]!,
          target: this.#colaNodes[targetIndex]!,
        });
      }
    }

    // Neighbourhood-aware ideal lengths: jaccardLinkLengths writes link.length
    // (= 1 + w * jaccard); the distance fed to Dijkstra is then idealLength * length.
    const lengthByLink = new Map<ColaLink, number>();
    const accessor = {
      getSourceIndex: (link: ColaLink) => link.source,
      getTargetIndex: (link: ColaLink) => link.target,
      setLength: (link: ColaLink, value: number) => {
        lengthByLink.set(link, value);
      },
    };
    jaccardLinkLengths(links, accessor, JACCARD_WEIGHT);

    const distances = new Calculator<ColaLink>(
      count,
      links,
      accessor.getSourceIndex,
      accessor.getTargetIndex,
      (link) => IDEAL_LINK_LENGTH * (lengthByLink.get(link) ?? 1),
    ).DistanceMatrix();
    const distanceMatrix = Descent.createSquareMatrix(
      count,
      (row, col) => distances[row]![col]!,
    );

    // Weights: 2 everywhere (non-adjacent, only repel when too close), 1 for
    // edges (pulled to ideal). Matches Layout.start; attached for the overlap pass.
    this.#weights = Descent.createSquareMatrix(count, () => 2);
    for (const link of links) {
      this.#weights[link.source]![link.target] = 1;
      this.#weights[link.target]![link.source] = 1;
    }

    const xs = this.#colaNodes.map((node) => node.x);
    const ys = this.#colaNodes.map((node) => node.y);
    this.#descent = new Descent([xs, ys], distanceMatrix);
    this.#descent.threshold = CONVERGENCE_THRESHOLD;
    // `descent.project` is null after construction, so Phase A is unconstrained
    // (computeNextPosition guards `if (this.project)`). Phase B sets the overlap
    // Projection. (cola's .d.ts mistypes `project` as non-nullable, hence no assign.)

    this.#rootGroup = { leaves: this.#colaNodes, groups: [], padding: 1 };

    this.#status = count > 0 ? "running" : "settled";
    this.#phase = count > 0 ? "stress" : "done";
    this.#writePositions();
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

  get buffer(): SharedArrayBuffer | ArrayBuffer {
    return this.#buffer.raw;
  }

  get nodeIds(): string[] {
    return this.#nodes.map((node) => node.id);
  }

  get alpha(): number {
    return this.#phase === "done" ? 0 : CONVERGENCE_THRESHOLD;
  }

  tick(budgetMs: number): boolean {
    if (this.#status === "settled" || this.#status === "paused") {
      return false;
    }
    this.#status = "running";
    const startTime = performance.now();
    let stepped = false;

    while (performance.now() - startTime < budgetMs && this.#phase !== "done") {
      this.#advance();
      stepped = true;
    }

    if (stepped) {
      this.#writePositions();
    }
    if (this.#phase === "done") {
      this.#status = "settled";
    }
    return stepped;
  }

  pause(): void {
    if (this.#status === "running") {
      this.#status = "paused";
    }
  }

  resume(): void {
    if (this.#status === "paused") {
      this.#status = "running";
    }
  }

  /** One unit of work, advancing the phase machine. cola owns every position. */
  #advance(): void {
    switch (this.#phase) {
      case "stress": {
        const disp = this.#descent.rungeKutta();
        this.#stressSteps += 1;
        const converged =
          Number.isFinite(disp) &&
          disp > 0 &&
          Math.abs(this.#prevDisp / disp - 1) < CONVERGENCE_THRESHOLD;
        this.#prevDisp = disp;
        if (
          converged ||
          disp === 0 ||
          !Number.isFinite(disp) ||
          this.#stressSteps >= STRESS_MAX_ITERS
        ) {
          this.#phase = "pack";
        }
        break;
      }
      case "pack": {
        this.#packComponents();
        // Switch on VPSC non-overlap. Projection rebuilds each node's bounds from
        // the descent's position arrays every step, so we needn't sync node x/y.
        const projection = new Projection(
          // cola's loose GraphNode/Group types, boundary casts. constraints must
          // be [] not null: Projection only inits xConstraints/yConstraints when
          // `constraints` is truthy, and project() does `xConstraints.concat(...)`
          // (Layout passes [] here too).
          this.#colaNodes as never,
          [],
          this.#rootGroup as never,
          [],
          true,
        );
        this.#descent.project = projection.projectFunctions();
        this.#descent.G = this.#weights;
        this.#overlapSteps = 0;
        this.#prevDisp = Number.MAX_VALUE;
        this.#phase = "overlap";
        break;
      }
      case "overlap": {
        const disp = this.#descent.rungeKutta();
        this.#overlapSteps += 1;
        if (this.#overlapSteps <= OVERLAP_MIN_ITERS) {
          // Guaranteed base: VPSC is stress-neutral at first, so a convergence
          // test would quit before overlap resolves. Run the base, then trust it.
          this.#prevDisp = disp;
          break;
        }
        // Past the base: stop once the descent floors (stable), same ratio test
        // as Phase A, or at the safety cap.
        const converged =
          disp === 0 ||
          (Number.isFinite(disp) &&
            disp > 0 &&
            Math.abs(this.#prevDisp / disp - 1) < CONVERGENCE_THRESHOLD);
        this.#prevDisp = disp;
        if (
          converged ||
          !Number.isFinite(disp) ||
          this.#overlapSteps >= OVERLAP_MAX_ITERS
        ) {
          this.#phase = "done";
        }
        break;
      }
      default:
        break;
    }
  }

  /**
   * Pack the connected components compactly (the geometric step stress can't do,
   * disconnected components have no inter-force). `applyPacking` works on node
   * x/y, so sync from the descent, pack, sync back. Mirrors
   * `Layout.separateOverlappingComponents`.
   */
  #packComponents(): void {
    const xs = this.#descent.x[0]!;
    const ys = this.#descent.x[1]!;
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let idx = 0; idx < this.#colaNodes.length; idx++) {
      const node = this.#colaNodes[idx]!;
      node.x = xs[idx]!;
      node.y = ys[idx]!;
      minX = Math.min(minX, node.x);
      maxX = Math.max(maxX, node.x);
      minY = Math.min(minY, node.y);
      maxY = Math.max(maxY, node.y);
    }
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);

    const graphs = separateGraphs(this.#colaNodes, this.#objectLinks as never);
    applyPacking(graphs, width, height, PACK_NODE_SIZE, 1, true);

    for (let idx = 0; idx < this.#colaNodes.length; idx++) {
      const node = this.#colaNodes[idx]!;
      xs[idx] = node.x;
      ys[idx] = node.y;
    }
  }

  /** Read cola's positions, re-centre on the origin, into the shared buffer + ForceNode view. */
  #writePositions(): void {
    const count = this.#nodes.length;
    const xs = this.#descent.x[0]!;
    const ys = this.#descent.x[1]!;
    let centroidX = 0;
    let centroidY = 0;
    for (let idx = 0; idx < count; idx++) {
      centroidX += xs[idx]!;
      centroidY += ys[idx]!;
    }
    centroidX = count > 0 ? centroidX / count : 0;
    centroidY = count > 0 ? centroidY / count : 0;

    for (let idx = 0; idx < count; idx++) {
      const localX = xs[idx]! - centroidX;
      const localY = ys[idx]! - centroidY;
      // Mirror into the ForceNode view so a warm-start can read settled coords.
      this.#nodes[idx]!.x = localX;
      this.#nodes[idx]!.y = localY;
      this.#buffer.setPosition(idx, localX, localY);
    }
    this.#buffer.commit();
  }
}

export function createFlatLayout(
  nodes: ForceNode[],
  edges: ForceEdge[],
  buffer: FlatGraphBuffer,
): LayoutSimulation {
  return new FlatLayout(nodes, edges, buffer);
}
