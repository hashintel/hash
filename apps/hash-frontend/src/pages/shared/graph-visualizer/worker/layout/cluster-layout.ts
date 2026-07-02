/**
 * Cluster (macro) layout, powered by WebCola.
 *
 * WebCola solves the layout we actually want directly: stress majorisation
 * embeds the link structure (connected clusters end up near each other, the
 * "edges have meaning" principle that motivated a structural layout over circle
 * packing), while gradient-projection non-overlap constraints guarantee the
 * bubbles never intersect. There is no force seed and no anchor: the positions
 * are the optimum of that objective, not a polish of some local minimum. A
 * crossing-reduction pass ({@link "./untangle"}) then runs over the settled
 * result to remove edge crossings WebCola's stress model does not target.
 *
 * The engine is driven manually (one majorisation step per `tick`, within a
 * time budget) so settling streams to the GPU live and never blocks the
 * worker. Positions are written to a SharedArrayBuffer, re-centred on the origin
 * each step (the parent translates them to world coords).
 *
 * Spacing is size-aware: link lengths and non-overlap padding scale with the
 * endpoints' radii, because top-level bubbles vary enormously in size (a 5k-node
 * type next to a 20-node one) and a single ideal length would pack the big ones
 * to touching. The root layout spreads generously; subcluster layouts stay snug
 * so children fill their parent circle.
 *
 * Confinement: WebCola lays out unconstrained and we re-centre; the parent
 * circle is sized by the cluster tree's packing, close to WebCola's non-overlap
 * extent. Sub-cluster confinement is enforced post-WebCola via `#fitWithin`;
 * rim ports as fixed WebCola boundary nodes remain future work (WebCola's
 * `fixed` node locking is the integration point).
 */
import { Layout } from "webcola";

import { PositionBuffer } from "../buffers/position-buffer";
import { defaultClusterForceConfig } from "./cluster-layout-config";

import type { Position } from "../../geometry";
import type { ClusterForceConfig } from "./cluster-layout-config";
import type {
  ForceEdge,
  ForceLayoutStatus,
  ForceNode,
  LayoutSimulation,
  PortAnchor,
} from "./force-simulation";
import type { InputNode, Link } from "webcola";

/** Drives WebCola one majorisation step at a time under a time budget. */
class SteppableLayout extends Layout {
  /** One stress-majorisation step. Returns true once converged. */
  runStep(): boolean {
    return this.tick();
  }
}

class ClusterLayout implements LayoutSimulation {
  readonly #nodes: ForceNode[];
  /** Children (0..n-1) plus any fixed port anchors appended by setPortAnchors. */
  #colaNodes: InputNode[];
  /** The children-only cola nodes (rebuilt from on each setPortAnchors). */
  readonly #childColaNodes: InputNode[];
  /** The inter-sibling links (anchor links are appended on setPortAnchors). */
  readonly #childLinks: Link<number>[];
  readonly #cola: SteppableLayout;
  readonly #buffer: PositionBuffer;
  readonly #confinementRadius: number | undefined;
  readonly #tuning: ClusterForceConfig;
  /** Scratch for the re-centred (and, if confined, fitted) local positions. */
  readonly #posX: Float64Array;
  readonly #posY: Float64Array;
  #status: ForceLayoutStatus;
  #steps = 0;

  constructor(
    nodes: ForceNode[],
    edges: ForceEdge[],
    confinementRadius: number | undefined,
    tuning: ClusterForceConfig,
  ) {
    this.#nodes = nodes;
    this.#buffer = new PositionBuffer(nodes.length);
    this.#confinementRadius = confinementRadius;
    this.#tuning = tuning;
    this.#posX = new Float64Array(nodes.length);
    this.#posY = new Float64Array(nodes.length);
    const isRoot = confinementRadius === undefined;

    let meanRadius = 0;
    for (const node of nodes) {
      meanRadius += node.radius;
    }
    meanRadius = nodes.length > 0 ? meanRadius / nodes.length : 1;

    const pad =
      (isRoot ? tuning.rootPaddingMultiplier : tuning.subPaddingMultiplier) *
      meanRadius;
    const sepMul = isRoot
      ? tuning.rootSeparationMultiplier
      : tuning.subSeparationMultiplier;

    const idToIndex = new Map<string, number>();
    for (const [index, node] of nodes.entries()) {
      idToIndex.set(node.id, index);
    }

    // Pad each bubble's collision box so WebCola's non-overlap constraint
    // matches our size-aware spacing.
    this.#colaNodes = nodes.map((node) => ({
      x: node.x ?? 0,
      y: node.y ?? 0,
      width: (node.radius + pad) * 2,
      height: (node.radius + pad) * 2,
    }));
    this.#childColaNodes = this.#colaNodes;

    // Resolve edges to index links with size-aware ideal lengths. We never
    // mutate the input edges (d3's forceLink rewrote source/target, a footgun).
    const links: Link<number>[] = [];
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
        const ideal =
          (nodes[sourceIndex]!.radius + nodes[targetIndex]!.radius) * sepMul;
        links.push({ source: sourceIndex, target: targetIndex, length: ideal });
      }
    }
    this.#childLinks = links;

    this.#cola = new SteppableLayout();
    this.#cola
      .nodes(this.#colaNodes)
      .links(links)
      .avoidOverlaps(true)
      .handleDisconnected(true);
    // Build the descent + distance matrix without iterating, then kick alpha so
    // our manual `tick`s drive the majorisation.
    this.#cola.start(0, 0, 0, 0, false, false);
    this.#cola.alpha(tuning.startAlpha);

    this.#status = "running";
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
    return this.#cola.alpha();
  }

  tick(budgetMs: number): boolean {
    if (this.#status === "settled" || this.#status === "paused") {
      return false;
    }
    this.#status = "running";
    const startTime = performance.now();
    let changed = false;
    let converged = false;

    while (performance.now() - startTime < budgetMs && !converged) {
      converged = this.#cola.runStep();
      this.#steps += 1;
      changed = true;
      if (this.#steps >= this.#tuning.maxSteps) {
        converged = true;
      }
    }

    if (changed) {
      this.#writePositions();
    }
    if (converged) {
      this.#status = "settled";
    }
    return changed;
  }

  pause(): void {
    if (this.#status === "running") {
      this.#status = "paused";
    }
  }

  resume(): void {
    if (this.#status === "paused") {
      this.#status = "running";
      this.#cola.alpha(this.#tuning.startAlpha);
    }
  }

  /**
   * Re-run the layout with fixed external-port anchors (see {@link PortAnchor}).
   * Each anchor is a pinned WebCola node on the rim; the children linked to it
   * are pulled toward their external connection, so they sort to the correct
   * side and feeders leave the container without crossing. Anchors are appended
   * after the children, so the SharedArrayBuffer output (children only, 0..n-1)
   * is unaffected.
   */
  setPortAnchors(anchors: readonly PortAnchor[]): void {
    if (anchors.length === 0) {
      return;
    }
    const childCount = this.#childColaNodes.length;
    const anchorNodes: InputNode[] = anchors.map((anchor) => ({
      x: anchor.x,
      y: anchor.y,
      fixed: 1,
      width: 1,
      height: 1,
    }));
    this.#colaNodes = [...this.#childColaNodes, ...anchorNodes];

    const links: Link<number>[] = [...this.#childLinks];
    const anchorLength =
      (this.#confinementRadius ?? 1) * this.#tuning.anchorLinkFraction;
    for (const [anchorOffset, anchor] of anchors.entries()) {
      const anchorIndex = childCount + anchorOffset;
      for (const child of anchor.children) {
        links.push({
          source: child.index,
          target: anchorIndex,
          length: anchorLength,
          weight: child.weight,
        });
      }
    }

    this.#cola
      .nodes(this.#colaNodes)
      .links(links)
      // Disable disconnected-component packing for the re-run: it can relocate
      // our fixed rim anchors. The anchors + sibling links provide connectivity.
      .handleDisconnected(false)
      .start(0, 0, 0, 0, false, false);
    this.#cola.alpha(this.#tuning.startAlpha);
    this.#status = "running";
    this.#steps = 0;
    this.#writePositions();
  }

  /**
   * Move the fixed port anchors in place: no re-run, no emit. WebCola re-reads
   * a fixed node's locked `px`/`py` each step, so updating them re-aims the
   * anchors; a still-running layout's children follow as it settles. (A layout
   * that has already settled won't move, which is acceptable: the macro and its
   * sub-clusters co-settle, which is when tracking matters.)
   */
  updateAnchorPositions(positions: readonly Position[]): void {
    const childCount = this.#childColaNodes.length;
    for (let idx = 0; idx < positions.length; idx++) {
      // childCount + idx is within #colaNodes only when setPortAnchors
      // appended anchors; cast reaches WebCola's undocumented px/py lock fields.
      const anchor = this.#colaNodes[childCount + idx] as
        | (InputNode & { px?: number; py?: number })
        | undefined;
      if (!anchor) {
        continue;
      }
      const target = positions[idx]!;
      anchor.x = target.x;
      anchor.px = target.x;
      anchor.y = target.y;
      anchor.py = target.y;
    }
  }

  /** Sync positions from WebCola, re-centred on the origin, into the shared buffer. */
  #writePositions(): void {
    const count = this.#nodes.length;
    let centroidX = 0;
    let centroidY = 0;
    for (let idx = 0; idx < count; idx++) {
      centroidX += this.#colaNodes[idx]!.x ?? 0;
      centroidY += this.#colaNodes[idx]!.y ?? 0;
    }
    centroidX = count > 0 ? centroidX / count : 0;
    centroidY = count > 0 ? centroidY / count : 0;

    const xs = this.#posX;
    const ys = this.#posY;
    for (let idx = 0; idx < count; idx++) {
      xs[idx] = (this.#colaNodes[idx]!.x ?? 0) - centroidX;
      ys[idx] = (this.#colaNodes[idx]!.y ?? 0) - centroidY;
    }

    // Sub-cluster layouts are confined to the parent circle. WebCola lays out
    // unconstrained: its stress spread is wider than the tree's circle-packing,
    // so without this the children stick out of their parent bubble. Clamp into
    // the circle and relax overlaps; a contained, ~non-overlapping fit exists
    // (the tree packed them), and the relaxation recovers it.
    if (this.#confinementRadius !== undefined) {
      this.#fitWithin(this.#confinementRadius);
    }

    const positions = this.#buffer.positions;
    for (let idx = 0; idx < count; idx++) {
      // Keep ForceNode x/y in sync with the buffer so downstream geometry
      // passes read settled local coords.
      this.#nodes[idx]!.x = xs[idx]!;
      this.#nodes[idx]!.y = ys[idx]!;
      positions[idx * 2] = xs[idx]!;
      positions[idx * 2 + 1] = ys[idx]!;
    }
    this.#buffer.commit();
  }

  /** Clamp positions inside the confinement circle and relax overlaps, in place. */
  #fitWithin(radius: number): void {
    const count = this.#nodes.length;
    const xs = this.#posX;
    const ys = this.#posY;
    const clamp = (idx: number): void => {
      const limit = Math.max(0, radius - this.#nodes[idx]!.radius);
      const dist = Math.hypot(xs[idx]!, ys[idx]!);
      if (dist > limit && dist > 0) {
        const scale = limit / dist;
        xs[idx] = xs[idx]! * scale;
        ys[idx] = ys[idx]! * scale;
      }
    };

    for (let idx = 0; idx < count; idx++) {
      clamp(idx);
    }
    for (let pass = 0; pass < this.#tuning.confinePasses; pass++) {
      let moved = false;
      for (let first = 0; first < count; first++) {
        for (let second = first + 1; second < count; second++) {
          let dx = xs[second]! - xs[first]!;
          let dy = ys[second]! - ys[first]!;
          let dist = Math.hypot(dx, dy);
          const minDist =
            this.#nodes[first]!.radius + this.#nodes[second]!.radius;
          if (dist < minDist) {
            if (dist < 1e-6) {
              dx = 1;
              dy = 0;
              dist = 1;
            }
            const push = (minDist - dist) / 2;
            const ux = (dx / dist) * push;
            const uy = (dy / dist) * push;
            xs[first] = xs[first]! - ux;
            ys[first] = ys[first]! - uy;
            xs[second] = xs[second]! + ux;
            ys[second] = ys[second]! + uy;
            moved = true;
          }
        }
      }
      for (let idx = 0; idx < count; idx++) {
        clamp(idx);
      }
      if (!moved) {
        break;
      }
    }
  }
}

/**
 * Creates a WebCola-backed cluster layout that streams re-centred positions
 * into a SharedArrayBuffer each tick.
 */
export function createClusterLayout(
  nodes: ForceNode[],
  edges: ForceEdge[],
  confinementRadius?: number,
  tuning: ClusterForceConfig = defaultClusterForceConfig,
): LayoutSimulation {
  return new ClusterLayout(nodes, edges, confinementRadius, tuning);
}
