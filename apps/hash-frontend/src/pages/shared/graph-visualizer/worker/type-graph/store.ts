/**
 * The type graph's node/edge store: which interned {@link TypeId}s are graph
 * nodes (vs. types interned only as `allOf` parents or edge link types),
 * their loaded/frontier state, and the deduplicated directed edge list with
 * per-node adjacency.
 *
 * Add-only, like the entity stores: nodes and edges are never removed, and a
 * frontier node only ever flips to loaded. That keeps change detection O(1)
 * (count comparisons) in the worker's commit path.
 */
import type { TypeId } from "../../ids";

/** One directed edge: a link type connecting a source to a target type node. */
export interface TypeGraphEdge {
  readonly source: TypeId;
  readonly target: TypeId;
  readonly linkTypeId: TypeId;
}

const EMPTY_NEIGHBOURS: ReadonlySet<TypeId> = new Set();

export class TypeGraphStore {
  /** Graph nodes in insertion order (layout builds iterate this). */
  readonly #nodes: TypeId[] = [];
  readonly #nodeSet = new Set<TypeId>();
  readonly #loaded = new Set<TypeId>();

  readonly #edges: TypeGraphEdge[] = [];
  /** `source|target|linkTypeId` triples already inserted. */
  readonly #edgeKeys = new Set<string>();

  /** Distinct neighbours per node (both directions, self excluded). */
  readonly #adjacency = new Map<TypeId, Set<TypeId>>();
  /** Edge-incidence count per node (a self-loop counts once). */
  readonly #degree = new Map<TypeId, number>();

  get nodeCount(): number {
    return this.#nodes.length;
  }

  get edgeCount(): number {
    return this.#edges.length;
  }

  /** Graph nodes in insertion order. Do not mutate. */
  get nodes(): readonly TypeId[] {
    return this.#nodes;
  }

  /** Deduplicated edges in insertion order. Do not mutate. */
  get edges(): readonly TypeGraphEdge[] {
    return this.#edges;
  }

  hasNode(id: TypeId): boolean {
    return this.#nodeSet.has(id);
  }

  isLoaded(id: TypeId): boolean {
    return this.#loaded.has(id);
  }

  /**
   * Add a node (or upgrade an existing frontier node to loaded). Returns
   * whether anything changed, so the caller can skip no-op commits.
   */
  addNode(id: TypeId, isLoaded: boolean): boolean {
    if (!this.#nodeSet.has(id)) {
      this.#nodeSet.add(id);
      this.#nodes.push(id);
      if (isLoaded) {
        this.#loaded.add(id);
      }
      return true;
    }

    if (isLoaded && !this.#loaded.has(id)) {
      this.#loaded.add(id);
      return true;
    }

    return false;
  }

  /** Add an edge unless the exact triple exists. Returns whether it was new. */
  addEdge(edge: TypeGraphEdge): boolean {
    const key = `${edge.source}|${edge.target}|${edge.linkTypeId}`;
    if (this.#edgeKeys.has(key)) {
      return false;
    }
    this.#edgeKeys.add(key);
    this.#edges.push(edge);

    this.#degree.set(edge.source, (this.#degree.get(edge.source) ?? 0) + 1);
    if (edge.target !== edge.source) {
      this.#degree.set(edge.target, (this.#degree.get(edge.target) ?? 0) + 1);
      this.#neighbourSet(edge.source).add(edge.target);
      this.#neighbourSet(edge.target).add(edge.source);
    }

    return true;
  }

  /** Distinct neighbours of a node (both directions, self excluded). */
  neighboursOf(id: TypeId): ReadonlySet<TypeId> {
    return this.#adjacency.get(id) ?? EMPTY_NEIGHBOURS;
  }

  degreeOf(id: TypeId): number {
    return this.#degree.get(id) ?? 0;
  }

  #neighbourSet(id: TypeId): Set<TypeId> {
    let set = this.#adjacency.get(id);
    if (!set) {
      set = new Set();
      this.#adjacency.set(id, set);
    }
    return set;
  }
}
