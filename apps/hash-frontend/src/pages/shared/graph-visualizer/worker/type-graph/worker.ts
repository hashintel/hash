/**
 * Worker-side orchestrator for the type-graph lifecycle: the ontology as one
 * whole-graph flat layout, nodes = types, edges = link types. The second of
 * the two worker lifecycles (see {@link "../entry"}); boots on `INIT_TYPE`.
 *
 * Deliberately a fraction of the entity lifecycle: no hierarchical regime,
 * no viewport-driven LOD, no commit coalescing (type graphs arrive in a few
 * hundred-node batches, not streamed tens of thousands). What it shares with
 * the entity flat tier it shares by construction: the same layout engines
 * (cola below the threshold, stress-majorization above, hysteretic), the
 * same interleaved {@link FlatGraphBuffer} SAB the renderer reads, the same
 * straight-edge writer, and the same frame shapes -- so the entire render
 * pipeline works unchanged.
 *
 * Every structural change rebuilds the layout warm-seeded from current
 * positions rather than absorbing in place: at ontology scale (hundreds of
 * nodes) a rebuild is cheap, and it keeps this file free of the entity
 * tier's absorb bookkeeping.
 */
import { dimColor } from "../../dim-color";
import { nodeIdForTypeId, TypeId, typeIdFromNodeId } from "../../ids";
import { FlatGraphBuffer } from "../buffers/position-buffer";
import { PositionScratch } from "../collections/position-scratch";
import { writeStraightFlatEdge } from "../core/flat-edge-writer";
import { placeFlatSeeds } from "../core/flat-seed";
import { FLAT_LAYOUT_ID, LayoutRegistry } from "../core/layout-registry";
import { TickScheduler } from "../core/schedulers";
import {
  colorForType,
  configureEntityStyle,
  edgeColorForType,
  entityStyle,
  FRONTIER_COLOR,
} from "../entity-style";
import {
  BezierSegmentSink,
  EndpointArrowSink,
} from "../geometry/edge-geometry";
import { createFlatLayout } from "../layout/flat-layout";
import { createMajorizationLayout } from "../layout/majorization-layout";
import { TypeRegistry } from "../store/type-registry";
import { TypeGraphStore } from "./store";

import type {
  Color,
  PositionsFrame,
  RenderTypeEdge,
  StructureFrame,
} from "../../frames";
import type { RepublishHandler } from "../buffers/growable-buffer";
import type {
  ForceEdge,
  ForceNode,
  LayoutSimulation,
} from "../layout/force-simulation";
import type { LayoutSideChannelMessage, TypeSchemaEntry } from "../protocol";
import type {
  IngestTypeEdge,
  IngestTypeNode,
  TypeGraphConfig,
  TypeIdTableMessage,
} from "./protocol";
import type { VersionedUrl } from "@blockprotocol/type-system";

/** The two engines the type graph runs (a subset of the entity VizModes). */
type TypeGraphEngine = "flat-force" | "community-force";

/** Side-channel traffic this lifecycle posts (buffer lifecycle + id table). */
export type TypeGraphSideMessage =
  | LayoutSideChannelMessage
  | TypeIdTableMessage;

/** Over-allocate capacity so later ingests can append without reallocation. */
function typeCapacityFor(count: number): number {
  return Math.max(count + 64, Math.ceil(count * 1.5));
}

/** One rendered edge: local layout indices + commit-time colour. */
interface TypeRenderEdge {
  readonly sourceIdx: number;
  readonly targetIdx: number;
  readonly color: Color;
  /** Index into the store's edge table (the segment's pick identity). */
  readonly edgeIdx: number;
}

/** Self-loop anchor angles: rim points ±60° around "up", loop bows outward. */
const SELF_LOOP_START_ANGLE = -Math.PI / 3;
const SELF_LOOP_END_ANGLE = (-2 * Math.PI) / 3;
/** How far (in node radii) a self-loop's control points reach outward. */
const SELF_LOOP_REACH = 2.6;

/**
 * By-degree type-node radius. The entity formula
 * ({@link "../entity-style".radiusForDegree}) with a gentler slope: an
 * ontology hub (Person, Organization) can touch a third of the graph, and
 * the full entity slope would turn it into a disk that dwarfs everything.
 */
function radiusForTypeDegree(degree: number): number {
  const style = entityStyle();
  return (
    style.dotBaseRadius *
    (1 + Math.log(1 + degree) * style.dotDegreeScale * 0.6)
  );
}

/**
 * Own a copy of the caller's config (the groups of a main-thread VizConfig
 * are shared objects; a later UPDATE_CONFIG must not mutate what we read).
 */
function cloneTypeGraphConfig(config: TypeGraphConfig): TypeGraphConfig {
  return {
    flatLayoutMaxNodes: config.flatLayoutMaxNodes,
    flatLayoutExitNodes: config.flatLayoutExitNodes,
    flatForce: { ...config.flatForce },
    majorization: { ...config.majorization },
    entityStyle: { ...config.entityStyle },
    stability: { ...config.stability },
    debug: config.debug,
  };
}

export class TypeGraphWorker {
  #config: TypeGraphConfig;

  readonly #registry = new TypeRegistry();
  readonly #store = new TypeGraphStore();
  readonly #layouts = new LayoutRegistry();
  readonly #ticker = new TickScheduler(() => this.#tick());

  /** Interleaved SharedArrayBuffer backing the layout (positions + radii + colours). */
  #buffer: FlatGraphBuffer | undefined;
  /** Re-publishes the layout buffer on reallocation. */
  readonly #republishBuffer: RepublishHandler = (raw, capacity) => {
    this.#onSideMessage?.({
      type: "BUFFER_REPUBLISHED",
      target: { kind: "layout", clusterId: FLAT_LAYOUT_ID },
      buffer: raw,
      capacity,
    });
  };

  #engine: TypeGraphEngine = "flat-force";
  /** Engine and edge count at the last layout build; a change forces a rebuild. */
  #builtEngine: TypeGraphEngine | undefined;
  #builtEdgeCount = -1;

  #renderEdges: TypeRenderEdge[] = [];

  /** Type nodes kept at full colour while a highlight is active; empty = none. */
  #highlighted = new Set<TypeId>();

  /** How many interned ids the main thread already has (see TYPE_ID_TABLE). */
  #publishedIdCount = 0;

  #structureVersion = 0;
  #positionsVersion = 0;
  readonly #bezierSink = new BezierSegmentSink();
  readonly #arrowSink = new EndpointArrowSink();
  /** Reusable prior-position buffer for warm-seeded rebuilds. */
  readonly #seedScratch = new PositionScratch<TypeId>();

  #onSideMessage: ((msg: TypeGraphSideMessage) => void) | undefined;
  #onStructureFrame: ((frame: StructureFrame) => void) | undefined;
  #onPositionsFrame: ((frame: PositionsFrame) => void) | undefined;

  constructor(config: TypeGraphConfig) {
    this.#config = cloneTypeGraphConfig(config);
    // Colour/size style is module state (hot loops); install it before any
    // commit pass runs.
    configureEntityStyle(this.#config.entityStyle);
  }

  get debug(): boolean {
    return this.#config.debug;
  }

  get nodeCount(): number {
    return this.#store.nodeCount;
  }

  get edgeCount(): number {
    return this.#store.edgeCount;
  }

  get engine(): TypeGraphEngine {
    return this.#engine;
  }

  set onSideMessage(
    handler: ((msg: TypeGraphSideMessage) => void) | undefined,
  ) {
    this.#onSideMessage = handler;
  }

  set onStructureFrame(handler: ((frame: StructureFrame) => void) | undefined) {
    this.#onStructureFrame = handler;
  }

  set onPositionsFrame(handler: ((frame: PositionsFrame) => void) | undefined) {
    this.#onPositionsFrame = handler;
  }

  /**
   * Ingest a batch of nodes, edges, and the link-type schemas the edges
   * reference, then commit if anything changed. Idempotent (see the message
   * contract in {@link "./protocol"}).
   */
  ingest(
    nodes: readonly IngestTypeNode[],
    edges: readonly IngestTypeEdge[],
    linkTypeSchemas: readonly TypeSchemaEntry[],
  ): void {
    // Register schemas for loaded nodes only: a frontier node's allOfRefs are
    // unknown, and registration is first-wins -- registering a placeholder
    // would freeze the type into a wrong (parentless) colour family once the
    // real schema arrives. Frontier nodes are interned below and render grey
    // until their loaded re-ingest registers them.
    this.#registry.registerAll(nodes.filter((node) => node.isLoaded));
    this.#registry.registerAll(linkTypeSchemas);

    let changed = false;

    for (const node of nodes) {
      const id = this.#registry.intern(node.url);
      if (this.#store.addNode(id, node.isLoaded)) {
        changed = true;
      }
    }

    for (const edge of edges) {
      const source = this.#registry.intern(edge.sourceUrl);
      const target = this.#registry.intern(edge.targetUrl);
      // An endpoint the caller never declared becomes a frontier node, so
      // every edge is always drawable.
      if (this.#store.addNode(source, false)) {
        changed = true;
      }
      if (this.#store.addNode(target, false)) {
        changed = true;
      }
      if (
        this.#store.addEdge({
          source,
          target,
          linkTypeId: this.#registry.intern(edge.linkTypeUrl),
        })
      ) {
        changed = true;
      }
    }

    if (changed) {
      this.commit();
    }
  }

  /**
   * Commit the current graph: re-evaluate the engine, rebuild the layout
   * warm-seeded when topology or engine changed, restyle the shared buffer,
   * and emit fresh frames.
   */
  commit(): void {
    const count = this.#store.nodeCount;

    if (count === 0) {
      this.#emitStructure(undefined);
      this.#emitPositions();
      return;
    }

    this.#engine = this.#nextEngine(count);

    const existing = this.#layouts.get(FLAT_LAYOUT_ID);
    const structureChanged =
      !existing ||
      this.#builtEngine !== this.#engine ||
      existing.nodes.length !== count ||
      this.#builtEdgeCount !== this.#store.edgeCount;

    let layoutRebuilt = false;
    if (structureChanged) {
      this.#rebuildLayout();
      layoutRebuilt = true;
    }

    const layout = this.#layouts.get(FLAT_LAYOUT_ID);
    const buffer = this.#buffer;
    if (!layout || !buffer) {
      return;
    }

    // Runs on every commit (not only structural ones): a loaded flip or a
    // registration recolours nodes without changing topology.
    this.#writeStyle(layout, buffer);
    this.#rebuildRenderEdges(layout);

    // The id table must cover every id the frames below reference, so the
    // tail publish precedes LAYOUT_CREATED and the structure frame.
    this.#publishIdTableTail();

    // Announce a rebuilt layout only after the style pass has filled the
    // buffer: the main thread starts reading the SAB on LAYOUT_CREATED, and
    // an earlier post would let it render colourless zero-radius records.
    if (layoutRebuilt) {
      this.#onSideMessage?.({
        type: "LAYOUT_CREATED",
        clusterId: FLAT_LAYOUT_ID,
        buffer: buffer.raw,
        nodeIds: layout.nodeIds,
        flatCapacity: buffer.capacity,
      });
    }

    this.#emitStructure(layout);
    this.#emitPositions();
  }

  /**
   * Set the highlighted type nodes (empty clears). Colour-only: restyles the
   * shared buffer in place and re-emits positions so edge dimming follows.
   */
  setHighlight(typeIds: readonly TypeId[]): void {
    this.#highlighted = new Set(typeIds);

    const layout = this.#layouts.get(FLAT_LAYOUT_ID);
    if (layout && this.#buffer) {
      this.#writeStyle(layout, this.#buffer);
    }
    this.#emitPositions();
  }

  /** A selected type node's distinct neighbours. */
  ego(typeId: TypeId): TypeId[] {
    return [...this.#store.neighboursOf(typeId)];
  }

  /**
   * Replace the live config: the layout engines copy their tuning at
   * construction, so the next commit force-rebuilds (warm-seeded).
   */
  updateConfig(next: TypeGraphConfig): void {
    this.#config = cloneTypeGraphConfig(next);
    configureEntityStyle(this.#config.entityStyle);
    this.#builtEngine = undefined;
    this.commit();
  }

  /** Freeze or resume the simulation (backgrounded visualizers cost nothing). */
  setSimulationPaused(paused: boolean): void {
    if (paused) {
      this.#ticker.pause();
    } else {
      this.#ticker.resume();
    }
  }

  /**
   * Engine selection with the entity tier's hysteresis (exit above
   * `flatLayoutExitNodes`, re-enter below `flatLayoutMaxNodes`), so a graph
   * hovering around the boundary doesn't flip engines on every ingest.
   */
  #nextEngine(count: number): TypeGraphEngine {
    if (
      this.#engine === "flat-force" &&
      count > this.#config.flatLayoutExitNodes
    ) {
      return "community-force";
    }
    if (
      this.#engine === "community-force" &&
      count < this.#config.flatLayoutMaxNodes
    ) {
      return "flat-force";
    }
    return this.#engine;
  }

  /** (Re)build the layout over the full node set, warm-seeded from current positions. */
  #rebuildLayout(): void {
    const { stability } = this.#config;
    const previous = this.#layouts.get(FLAT_LAYOUT_ID);

    // Prior positions keep placed nodes in place; new nodes seed beside a
    // placed neighbour or fall back to a phyllotaxis disk.
    const placed = this.#seedScratch;
    placed.reset(this.#registry.size);
    if (previous) {
      for (const node of previous.nodes) {
        placed.set(typeIdFromNodeId(node.id), node.x ?? 0, node.y ?? 0);
      }
    }

    const typeIds = this.#store.nodes;
    placeFlatSeeds(typeIds, placed, (id) => this.#store.neighboursOf(id), {
      neighbourOffset: stability.flatSeedNeighbourOffset,
      diskScale: stability.flatSeedDiskScale,
    });

    const nodes: ForceNode[] = typeIds.map((id) => ({
      id: nodeIdForTypeId(id),
      x: placed.x(id),
      y: placed.y(id),
      radius: radiusForTypeDegree(this.#store.degreeOf(id)),
    }));
    const edges = this.#buildForceEdges();

    const buffer = new FlatGraphBuffer(
      typeCapacityFor(nodes.length),
      this.#republishBuffer,
    );
    buffer.setCount(nodes.length);

    const layout =
      this.#engine === "community-force"
        ? createMajorizationLayout(
            nodes,
            edges,
            buffer,
            this.#config.majorization,
          )
        : createFlatLayout(nodes, edges, buffer, this.#config.flatForce);

    if (previous) {
      this.#onSideMessage?.({
        type: "LAYOUT_DESTROYED",
        clusterId: FLAT_LAYOUT_ID,
      });
    }

    this.#buffer = buffer;
    this.#builtEngine = this.#engine;
    this.#builtEdgeCount = this.#store.edgeCount;
    this.#layouts.set(FLAT_LAYOUT_ID, "entities", layout);
    this.#ticker.ensureRunning();

    // LAYOUT_CREATED is deferred until commit()'s style pass has filled the buffer.
  }

  /**
   * Force edges for the layout engines: one edge per connected unordered
   * pair (parallel link types collapse; a doubly-linked pair should not be
   * pulled twice as hard), self-loops excluded (no attraction to model;
   * they render as loops but do not move anything).
   */
  #buildForceEdges(): ForceEdge[] {
    const edges: ForceEdge[] = [];
    const seen = new Set<string>();

    for (const edge of this.#store.edges) {
      if (edge.source === edge.target) {
        continue;
      }
      const key =
        edge.source < edge.target
          ? `${edge.source}|${edge.target}`
          : `${edge.target}|${edge.source}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      edges.push({
        source: nodeIdForTypeId(edge.source),
        target: nodeIdForTypeId(edge.target),
        weight: 1,
      });
    }

    return edges;
  }

  /**
   * Write per-node radius + colour into the interleaved shared buffer.
   * Loaded nodes colour by their inheritance root (family hue, depth
   * shading); frontier nodes render the shared frontier grey; a live
   * highlight dims everyone outside it.
   */
  #writeStyle(layout: LayoutSimulation, buffer: FlatGraphBuffer): void {
    const highlighted = this.#highlighted;

    for (let idx = 0; idx < layout.nodes.length; idx++) {
      const node = layout.nodes[idx]!;
      const typeId = typeIdFromNodeId(node.id);

      buffer.setRadius(idx, node.radius);

      const base = this.#store.isLoaded(typeId)
        ? colorForType(typeId, this.#registry)
        : FRONTIER_COLOR;
      const dimmed = highlighted.size > 0 && !highlighted.has(typeId);

      buffer.setColor(idx, dimmed ? dimColor(base) : base);
      // The join key: which type this record is (the main thread resolves
      // urls / labels / picking via the TYPE_ID_TABLE).
      buffer.setEntityIdx(idx, typeId);
    }

    buffer.setCount(layout.nodes.length);
    buffer.commit();
  }

  /**
   * Rebuild the render edges: local node indices + link-type colour, one per
   * store edge (parallel link types draw as separate coincident strokes,
   * exactly as parallel links do in the entity flat tier).
   */
  #rebuildRenderEdges(layout: LayoutSimulation): void {
    const localOf = new Map<TypeId, number>();
    for (let idx = 0; idx < layout.nodeIds.length; idx++) {
      localOf.set(typeIdFromNodeId(layout.nodeIds[idx]!), idx);
    }

    const renderEdges: TypeRenderEdge[] = [];
    const storeEdges = this.#store.edges;
    for (let edgeIdx = 0; edgeIdx < storeEdges.length; edgeIdx++) {
      const edge = storeEdges[edgeIdx]!;
      const sourceIdx = localOf.get(edge.source);
      const targetIdx = localOf.get(edge.target);
      if (sourceIdx === undefined || targetIdx === undefined) {
        continue;
      }
      renderEdges.push({
        sourceIdx,
        targetIdx,
        color: edgeColorForType(edge.linkTypeId, this.#registry),
        edgeIdx,
      });
    }

    this.#renderEdges = renderEdges;
  }

  /** Publish the interned-url table tail the main thread is missing. */
  #publishIdTableTail(): void {
    const size = this.#registry.size;
    if (size <= this.#publishedIdCount) {
      return;
    }

    const urls: VersionedUrl[] = [];
    for (let id = this.#publishedIdCount; id < size; id++) {
      // Every id below the interner's size has a url by construction.
      urls.push(this.#registry.getUrl(TypeId(id))!);
    }

    this.#onSideMessage?.({
      type: "TYPE_ID_TABLE",
      startId: TypeId(this.#publishedIdCount),
      urls,
    });
    this.#publishedIdCount = size;
  }

  #emitStructure(layout: LayoutSimulation | undefined): void {
    this.#structureVersion++;

    const typeEdges: RenderTypeEdge[] = this.#store.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      linkTypeId: edge.linkTypeId,
    }));

    this.#onStructureFrame?.({
      version: this.#structureVersion,
      mode: this.#engine,
      clusters: [],
      entityLayers: [],
      flatGraph: layout
        ? { layoutId: FLAT_LAYOUT_ID, count: layout.nodes.length }
        : undefined,
      highwayLanes: [],
      typeEdges,
    });
  }

  /** Emit one positions tick: edge geometry from current node positions. */
  #emitPositions(): void {
    this.#bezierSink.reset();
    this.#arrowSink.reset();
    this.#buildEdgeBeziers();

    this.#positionsVersion++;
    this.#onPositionsFrame?.({
      version: this.#positionsVersion,
      settled: !this.#layouts.anyLayoutRunning(),
      clusterPositions: new Float32Array(0),
      beziers: this.#bezierSink.snapshot(),
      edgeLabels: [],
      edgeArrows: [],
      flatArrows: this.#arrowSink.snapshot(),
      entityFanOut: [],
    });
  }

  /**
   * Emit one segment per render edge from current node positions: straight
   * clipped cubics via the shared flat writer, self-loops as a small bowed
   * loop anchored on the node's rim. Segment ids are store edge-table
   * indices (resolved against {@link StructureFrame.typeEdges}).
   */
  #buildEdgeBeziers(): void {
    const layout = this.#layouts.get(FLAT_LAYOUT_ID);
    if (!layout) {
      return;
    }

    const { nodes } = layout;
    const highlighted = this.#highlighted;
    const edgeWidth = entityStyle().flatEdgeWidth;

    for (const edge of this.#renderEdges) {
      const source = nodes[edge.sourceIdx];
      const target = nodes[edge.targetIdx];
      if (!source || !target) {
        continue;
      }

      // An edge stays full only when both endpoints are highlighted.
      const full =
        highlighted.size === 0 ||
        (highlighted.has(typeIdFromNodeId(source.id)) &&
          highlighted.has(typeIdFromNodeId(target.id)));
      const color = full ? edge.color : dimColor(edge.color);

      if (edge.sourceIdx === edge.targetIdx) {
        this.#writeSelfLoop(source, color, edgeWidth, edge.edgeIdx);
        continue;
      }

      writeStraightFlatEdge(
        this.#bezierSink,
        this.#arrowSink,
        source.x ?? 0,
        source.y ?? 0,
        source.radius,
        target.x ?? 0,
        target.y ?? 0,
        target.radius,
        color,
        edgeWidth,
        edge.edgeIdx,
      );
    }
  }

  /**
   * A self-referential link type (e.g. Person -[knows]-> Person) as a loop:
   * a cubic between two rim points whose control points bow outward, plus an
   * arrowhead where the loop re-enters the node.
   */
  #writeSelfLoop(
    node: ForceNode,
    color: Color,
    edgeWidth: number,
    edgeIdx: number,
  ): void {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const rim = node.radius + edgeWidth;
    const reach = rim * SELF_LOOP_REACH;

    const cosStart = Math.cos(SELF_LOOP_START_ANGLE);
    const sinStart = Math.sin(SELF_LOOP_START_ANGLE);
    const cosEnd = Math.cos(SELF_LOOP_END_ANGLE);
    const sinEnd = Math.sin(SELF_LOOP_END_ANGLE);

    const p0x = x + cosStart * rim;
    const p0y = y + sinStart * rim;
    const p3x = x + cosEnd * rim;
    const p3y = y + sinEnd * rim;
    const p1x = x + cosStart * (rim + reach);
    const p1y = y + sinStart * (rim + reach);
    const p2x = x + cosEnd * (rim + reach);
    const p2y = y + sinEnd * (rim + reach);

    this.#bezierSink.pushUnclipped(
      p0x,
      p0y,
      p1x,
      p1y,
      p2x,
      p2y,
      p3x,
      p3y,
      color,
      edgeWidth,
      edgeIdx,
    );

    this.#arrowSink.push(
      p3x,
      p3y,
      Math.atan2(p3y - p2y, p3x - p2x),
      edgeWidth,
      reach,
      color,
    );
  }

  /** One simulation step: advance the layout, emit positions while it moves. */
  #tick(): void {
    const layout = this.#layouts.get(FLAT_LAYOUT_ID);
    if (!layout) {
      this.#ticker.stop();
      return;
    }

    const wasRunning = this.#layouts.anyLayoutRunning();
    const changed = layout.status === "running" ? layout.tick(1) : false;
    const justSettled = wasRunning && !this.#layouts.anyLayoutRunning();

    // Edges are worker-built beziers; emit a frame so they track the moved
    // dots. The settle edge also emits once so the final frame carries
    // settled: true.
    if (changed || justSettled) {
      this.#emitPositions();
    }

    if (!this.#layouts.anyLayoutRunning()) {
      this.#ticker.stop();
    }
  }
}
