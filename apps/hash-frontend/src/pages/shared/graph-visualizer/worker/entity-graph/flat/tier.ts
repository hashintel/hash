/**
 * The flat tier: the whole entity set rendered as one individual-entity
 * graph (both the small-N cola tier and the medium-N community/stress tier).
 *
 * Owns the interleaved SharedArrayBuffer the flat layout streams into and the
 * commit path that decides between reuse, warm absorption, and a full
 * rebuild. Render edges + bezier emission live in {@link FlatEdgePipeline};
 * the layout itself lives in the shared {@link LayoutRegistry} under
 * {@link FLAT_LAYOUT_ID} so the scheduler ticks it like any other.
 */
import { dimColor } from "../../../dim-color";
import { entityIndexFromNodeId } from "../../../ids";
import { FlatGraphBuffer } from "../../buffers/position-buffer";
import { PositionScratch } from "../../collections/position-scratch";
import { FLAT_LAYOUT_ID } from "../../core/layout-registry";
import { createFlatLayout } from "../../layout/flat-layout";
import { createMajorizationLayout } from "../../layout/majorization-layout";
import { buildEntityEdges } from "../entity-edges";
import { colorForEntity } from "./colors";
import { FlatEdgePipeline } from "./edges";
import { seedFlatNodes } from "./seed";

import type { VizConfig } from "../../../config";
import type { RenderFlatGraph } from "../../../frames";
import type { EntityIndex, VizMode } from "../../../ids";
import type { RepublishHandler } from "../../buffers/growable-buffer";
import type { CommittedView } from "../../core/committed-view";
import type { LayoutRegistry } from "../../core/layout-registry";
import type {
  BezierSegmentSink,
  EndpointArrowSink,
} from "../../geometry/edge-geometry";
import type { LayoutSimulation } from "../../layout/force-simulation";
import type {
  CapturedLayoutFixture,
  LayoutSideChannelMessage,
} from "../../protocol";
import type { TypeRegistry } from "../../store/type-registry";
import type { EntityStore } from "../store/entity";
import type { LinkStore } from "../store/link";
import type { TypeSetStore } from "../store/type-set";
import type { ColorCache } from "./colors";

/** Over-allocate capacity so streamed nodes can append without reallocation. */
function flatCapacityFor(count: number): number {
  return Math.max(count + 64, Math.ceil(count * 1.5));
}

export interface FlatTierDependencies {
  readonly config: VizConfig;
  readonly layouts: LayoutRegistry;
  readonly view: CommittedView;
  readonly links: LinkStore;
  readonly entities: EntityStore;
  readonly typeSets: TypeSetStore;
  readonly types: TypeRegistry;
  readonly mode: () => VizMode;
  readonly nodeCount: () => number;
  readonly snapshotNodeEntityIdxs: () => EntityIndex[];
  readonly rootFlipPending: () => boolean;
  readonly highlightedEntities: () => ReadonlySet<EntityIndex>;
  readonly ensureSchedulerRunning: () => void;
  readonly postLayoutMessage: (msg: LayoutSideChannelMessage) => void;
  readonly emitStructure: (flatGraph?: RenderFlatGraph) => void;
  readonly emitPositions: () => void;
}

export class FlatTierController {
  readonly #dependencies: FlatTierDependencies;

  /** Interleaved SharedArrayBuffer backing the flat layout (positions + radii + colours). */
  #buffer: FlatGraphBuffer | undefined;

  /** Re-publishes the flat layout buffer on reallocation. */
  readonly #republishBuffer: RepublishHandler = (raw, capacity) => {
    this.#dependencies.postLayoutMessage({
      type: "BUFFER_REPUBLISHED",
      target: { kind: "layout", clusterId: FLAT_LAYOUT_ID },
      buffer: raw,
      capacity,
    });
  };

  /** Render edges + per-tick bezier emission (the positions emitter reads it). */
  readonly #edges: FlatEdgePipeline;
  /** Link count at the last flat-layout (re)build; a change forces a rebuild. */
  #builtLinkCount = -1;
  /** Which engine the current flat layout was built for ("flat-force" -> cola,
   * "community-force" -> stress). Crossing that boundary forces a rebuild. */
  #builtLayoutMode: VizMode | undefined;
  /** Trailing-debounce timer: one final Louvain once community-force ingests quiet. */
  #lingerTimer: ReturnType<typeof setTimeout> | undefined;

  /** Reusable prior-position buffer for seeding passes (see {@link seedFlatNodes}). */
  readonly #seedScratch = new PositionScratch<EntityIndex>();

  constructor(dependencies: FlatTierDependencies) {
    this.#dependencies = dependencies;
    this.#edges = new FlatEdgePipeline({
      links: dependencies.links,
      typeSets: dependencies.typeSets,
      types: dependencies.types,
      layout: () => dependencies.layouts.get(FLAT_LAYOUT_ID),
      highlightedEntities: dependencies.highlightedEntities,
    });
  }

  get hasRenderEdges(): boolean {
    return this.#edges.hasRenderEdges;
  }

  /**
   * Commit the flat tier: the whole entity set as one individual-entity graph.
   *
   * Detects topology changes via O(1) node/link count comparison (stores are
   * add-only). Returns immediately when nothing changed. A colour-only change
   * (type registration or root flip) restyles without rebuilding the layout.
   */
  commit(opts?: { readonly rebuildTree?: boolean }): void {
    const { layouts, links, view } = this.#dependencies;
    const nodeCount = this.#dependencies.nodeCount();

    if (nodeCount === 0) {
      this.tearDown();
      view.clearRendered();
      this.#dependencies.emitStructure();
      this.#dependencies.emitPositions();
      return;
    }

    const existing = layouts.get(FLAT_LAYOUT_ID);
    const modeChanged = this.#builtLayoutMode !== this.#dependencies.mode();
    // Add-only stores: a count delta versus the live layout's built count (and
    // versus the link count at that build) captures every topology change.
    const builtNodeCount = existing?.nodes.length ?? -1;
    const nodesChanged = nodeCount !== builtNodeCount;
    const linksChanged = links.count !== this.#builtLinkCount;
    const structureChanged =
      !existing || modeChanged || nodesChanged || linksChanged;

    // A type registration (rebuildTree) or a frontier->root flip recolours
    // nodes without changing topology; restyle in place, no layout rebuild.
    const styleDirty =
      opts?.rebuildTree === true || this.#dependencies.rootFlipPending();

    if (!structureChanged && !styleDirty) {
      // Nothing changed: the layout keeps streaming positions via the
      // scheduler, no frame or buffer write needed.
      return;
    }

    let layoutRebuilt = false;
    if (structureChanged) {
      // Materialise the packed column into a plain array for the layout builders
      // (they map/filter/spread it). Only reached on a real structural change --
      // the no-op path above never allocates.
      const entityIdxs = this.#dependencies.snapshotNodeEntityIdxs();

      // community-force layouts can warm-absorb additions in place; everything
      // else (first build, mode switch, or a shrink -- impossible with add-only
      // stores, handled defensively) rebuilds, warm-seeded from current spots.
      const canAbsorb =
        !!existing &&
        !modeChanged &&
        nodeCount >= builtNodeCount &&
        this.#dependencies.mode() === "community-force" &&
        typeof existing.absorb === "function";

      if (canAbsorb) {
        this.#absorbNodes(existing, entityIdxs);
      } else {
        this.#rebuildLayout(entityIdxs);
        layoutRebuilt = true;
      }
    }

    const layout = layouts.get(FLAT_LAYOUT_ID);
    const buffer = this.#buffer;
    if (!layout || !buffer) {
      this.#dependencies.emitStructure();
      this.#dependencies.emitPositions();
      return;
    }

    // Per-node radius + colour into the shared buffer, plus the per-link render
    // edges for the bezier emission. Both run on any structural OR colour change
    // (so colours track a type change even when the layout was reused), and are
    // skipped on the no-op path above.
    this.writeStyle(layout, buffer);
    this.#edges.rebuild(layout);

    // Announce a rebuilt layout only after the style pass above has filled the
    // buffer: the main thread starts reading the SAB on LAYOUT_CREATED, and an
    // earlier post would let it render colourless zero-radius records.
    if (layoutRebuilt) {
      this.#dependencies.postLayoutMessage({
        type: "LAYOUT_CREATED",
        clusterId: FLAT_LAYOUT_ID,
        buffer: buffer.raw,
        nodeIds: layout.nodeIds,
        flatCapacity: buffer.capacity,
      });
    }

    this.#emitFrame(layout);
    if (structureChanged) {
      this.#scheduleLouvainLinger();
    }
  }

  /** Re-write node colours honouring the current highlight (no rebuild). */
  restyle(): void {
    const layout = this.#dependencies.layouts.get(FLAT_LAYOUT_ID);
    if (layout && this.#buffer) {
      this.writeStyle(layout, this.#buffer);
    }
  }

  /**
   * Mark the built layout stale so the next {@link commit} rebuilds it
   * (warm-seeded from current positions) instead of reusing it. Used by
   * live config updates: the layout engines copy their tuning at
   * construction, so new tuning needs a rebuild to take effect.
   */
  invalidateLayout(): void {
    this.#builtLayoutMode = undefined;
  }

  /**
   * capture-live-fixture debug hook: serialize the live flat-tier layout (node
   * positions/radii, deduped edges rebuilt from the link store exactly as the
   * layout received them, Louvain communities) for replay via
   * `forceGraphFromCapturedFixture` in bench-fixtures.ts. Null when no flat
   * layout is live.
   */
  captureFixture(): CapturedLayoutFixture | null {
    const layout = this.#dependencies.layouts.get(FLAT_LAYOUT_ID);
    if (!layout || layout.nodes.length === 0) {
      return null;
    }
    const entityIdxs = layout.nodes.map((node) =>
      entityIndexFromNodeId(node.id),
    );
    const edges = buildEntityEdges(
      entityIdxs,
      layout.nodes,
      this.#dependencies.links,
    );
    return {
      capturedAt: new Date().toISOString(),
      nodes: layout.nodes.map((node) => ({
        id: node.id,
        x: node.x ?? 0,
        y: node.y ?? 0,
        radius: node.radius,
      })),
      edges: edges.map((edge) => ({
        source: typeof edge.source === "string" ? edge.source : edge.source.id,
        target: typeof edge.target === "string" ? edge.target : edge.target.id,
        weight: edge.weight,
      })),
      communities: layout.communities
        ? [...layout.communities]
        : layout.nodes.map(() => -1),
    };
  }

  /** Destroy the flat layout + its shared buffer (entering the hierarchical regime). */
  tearDown(): void {
    const { layouts } = this.#dependencies;
    if (layouts.has(FLAT_LAYOUT_ID)) {
      layouts.delete(FLAT_LAYOUT_ID);
      this.#dependencies.postLayoutMessage({
        type: "LAYOUT_DESTROYED",
        clusterId: FLAT_LAYOUT_ID,
      });
    }

    this.#buffer = undefined;
    this.#edges.clear();
    this.#builtLinkCount = -1;
    this.#builtLayoutMode = undefined;
    if (this.#lingerTimer !== undefined) {
      clearTimeout(this.#lingerTimer);
      this.#lingerTimer = undefined;
    }
  }

  /** Emit the flat structure frame (count + Louvain membership) and positions. */
  #emitFrame(layout: LayoutSimulation): void {
    this.#dependencies.emitStructure({
      layoutId: FLAT_LAYOUT_ID,
      count: layout.nodes.length,
      communities: layout.communities
        ? Int32Array.from(layout.communities)
        : undefined,
    });
    this.#dependencies.emitPositions();
  }

  /**
   * After ingests go quiet for `stability.flatLouvainLingerMs`, run one
   * trailing Louvain so BubbleSets reflect the settled graph; the last batch
   * may not have crossed the growth-fraction refresh threshold. Relabel-only
   * by contract ({@link LayoutSimulation.refreshCommunities} is
   * position-neutral): the re-emitted frame regroups the hulls, while a solve
   * still in flight keeps its build-time community target shaping until the
   * next absorb rebuilds the solver, which is also why this path needs no
   * scheduler re-kick.
   */
  #scheduleLouvainLinger(): void {
    if (this.#dependencies.mode() !== "community-force") {
      return;
    }
    if (this.#lingerTimer !== undefined) {
      clearTimeout(this.#lingerTimer);
    }
    this.#lingerTimer = setTimeout(() => {
      this.#lingerTimer = undefined;
      const layout = this.#dependencies.layouts.get(FLAT_LAYOUT_ID);
      if (layout?.refreshCommunities?.()) {
        this.#emitFrame(layout);
      }
    }, this.#dependencies.config.stability.flatLouvainLingerMs);
  }

  /**
   * (Re)build the flat layout over the given node set. Warm-seeded from the
   * current layout's positions so existing nodes stay in place.
   */
  #rebuildLayout(entityIdxs: readonly EntityIndex[]): void {
    const { layouts, links, config } = this.#dependencies;
    const previous = layouts.get(FLAT_LAYOUT_ID);
    const priorPositions = this.#capturePriorPositions(previous);

    const nodes = seedFlatNodes(
      entityIdxs,
      priorPositions,
      links,
      this.#seedTuning(),
    );
    const edges = buildEntityEdges(entityIdxs, nodes, links);

    // One interleaved shared buffer for all per-node data. Over-allocated
    // so community-force can append streamed nodes without reallocation.
    const buffer = new FlatGraphBuffer(
      flatCapacityFor(nodes.length),
      this.#republishBuffer,
    );
    buffer.setCount(nodes.length);

    // flat-force uses cola; community-force uses the constrained
    // stress-majorization engine (the only community-tier engine). Both fill the
    // same shared buffer; downstream style/edges/render are identical.
    const layout =
      this.#dependencies.mode() === "community-force"
        ? createMajorizationLayout(nodes, edges, buffer, config.majorization)
        : createFlatLayout(nodes, edges, buffer, config.flatForce);

    if (previous) {
      this.#dependencies.postLayoutMessage({
        type: "LAYOUT_DESTROYED",
        clusterId: FLAT_LAYOUT_ID,
      });
    }

    this.#buffer = buffer;
    this.#builtLinkCount = links.count;
    this.#builtLayoutMode = this.#dependencies.mode();
    layouts.set(FLAT_LAYOUT_ID, "entities", layout);
    this.#dependencies.ensureSchedulerRunning();

    // The LAYOUT_CREATED message is delayed and only sent after the style pass inside of commit().
  }

  /**
   * Absorb newly-arrived nodes into the live community-force layout without a
   * full rebuild. New nodes are seeded beside placed neighbours; appended
   * records land in the buffer's spare capacity.
   */
  #absorbNodes(
    layout: LayoutSimulation,
    entityIdxs: readonly EntityIndex[],
  ): void {
    const priorPositions = this.#capturePriorPositions(layout);

    // Which incoming indices are new, recorded before seeding places them.
    const isNew = entityIdxs.map((idx) => !priorPositions.has(idx));
    const seeded = seedFlatNodes(
      entityIdxs,
      priorPositions,
      this.#dependencies.links,
      this.#seedTuning(),
    );

    const newNodes = seeded.filter((_, position) => isNew[position]!);
    const edges = buildEntityEdges(
      [...entityIdxs],
      seeded,
      this.#dependencies.links,
    );

    // If the new count exceeds capacity, re-allocate (the flat shared buffer
    // is non-resizable for GPU upload). The layout's warm state is preserved.
    if (this.#buffer && entityIdxs.length > this.#buffer.capacity) {
      this.#buffer.ensureCapacity(flatCapacityFor(entityIdxs.length));
    }

    layout.absorb?.(newNodes, edges);
    this.#builtLinkCount = this.#dependencies.links.count;
    // absorb() re-energises the layout, but the scheduler may have stopped
    // when it last settled, so re-kick it.
    this.#dependencies.ensureSchedulerRunning();
  }

  /** Seeding geometry from the live config (see {@link seedFlatNodes}). */
  #seedTuning(): { neighbourOffset: number; diskScale: number } {
    const { stability } = this.#dependencies.config;

    return {
      neighbourOffset: stability.flatSeedNeighbourOffset,
      diskScale: stability.flatSeedDiskScale,
    };
  }

  /**
   * Snapshot a layout's node positions into the reusable seed scratch,
   * indexed by entity index. Sized to the whole entity store so any incoming
   * index can be probed.
   */
  #capturePriorPositions(
    layout: LayoutSimulation | undefined,
  ): PositionScratch<EntityIndex> {
    const scratch = this.#seedScratch;
    scratch.reset(this.#dependencies.entities.size);

    if (layout) {
      for (const node of layout.nodes) {
        scratch.set(entityIndexFromNodeId(node.id), node.x ?? 0, node.y ?? 0);
      }
    }

    return scratch;
  }

  /** Write per-node radius + colour into the interleaved shared buffer. */
  writeStyle(layout: LayoutSimulation, buffer: FlatGraphBuffer): void {
    const { entities, typeSets, types } = this.#dependencies;
    const highlighted = this.#dependencies.highlightedEntities();
    const colorByGroup: ColorCache = new Map();

    for (let idx = 0; idx < layout.nodes.length; idx++) {
      const node = layout.nodes[idx]!;
      const entityIdx = entityIndexFromNodeId(node.id);

      buffer.setRadius(idx, node.radius);

      const base = colorForEntity(
        entityIdx,
        colorByGroup,
        entities,
        typeSets,
        types,
      );
      const dimmed = highlighted.size > 0 && !highlighted.has(entityIdx);

      buffer.setColor(idx, dimmed ? dimColor(base) : base);
      // The join key: which entity this record is (the main thread pairs it with
      // the EntityId map shared buffer to resolve labels / icons / tooltips / picking).
      buffer.setEntityIdx(idx, entityIdx);
    }

    buffer.setCount(layout.nodes.length);
    buffer.commit();
  }

  /** Emit one straight cubic per flat render edge. See {@link FlatEdgePipeline.buildEdgeBeziers}. */
  buildEdgeBeziers(sink: BezierSegmentSink, arrows: EndpointArrowSink): void {
    this.#edges.buildEdgeBeziers(sink, arrows);
  }
}
