import { LinkIdx } from "../../ids";
import { Column } from "../collections/column";

import type { EntityIdx, TypeSetIdx } from "../../ids";
import type { EntityId } from "@blockprotocol/type-system";

export interface LinkEndpoint {
  readonly linkIdx: number;
  readonly otherIdx: EntityIdx;
  readonly typeSetIdx: TypeSetIdx;
  readonly direction: "out" | "in";
}

/**
 * Link storage: columnar arrays for endpoints, link type, and
 * entity index. Tracks pending links whose endpoints haven't
 * been ingested yet.
 */
export class LinkStore {
  readonly #leftIdx: Column<Int32Array, EntityIdx | -1> = new Column(
    Int32Array,
    1024,
  );

  readonly #rightIdx: Column<Int32Array, EntityIdx | -1> = new Column(
    Int32Array,
    1024,
  );

  readonly #typeIdx: Column<Uint32Array, TypeSetIdx> = new Column(
    Uint32Array,
    1024,
  );

  readonly #entityIdIdx: Column<Uint32Array, EntityIdx> = new Column(
    Uint32Array,
    1024,
  );

  readonly #pendingByEndpoint: Map<EntityId, LinkIdx[]> = new Map();

  // Adjacency index: entityIdx -> list of link indices touching that entity.
  readonly #adjacency: Map<number, LinkIdx[]> = new Map();

  get count(): number {
    return this.#leftIdx.length;
  }

  /**
   * Record a link. Endpoints are -1 when the target entity
   * hasn't been ingested yet (frontier case).
   */
  insert(
    leftIdx: EntityIdx | -1,
    rightIdx: EntityIdx | -1,
    typeSetIdx: TypeSetIdx,
    linkEntityIdx: EntityIdx,
  ): LinkIdx {
    this.#leftIdx.push(leftIdx);
    this.#rightIdx.push(rightIdx);
    this.#typeIdx.push(typeSetIdx);
    this.#entityIdIdx.push(linkEntityIdx);

    const linkIdx = LinkIdx(this.#leftIdx.length - 1);

    if (leftIdx !== -1) {
      this.#addToAdjacency(leftIdx, linkIdx);
    }
    if (rightIdx !== -1) {
      this.#addToAdjacency(rightIdx, linkIdx);
    }

    return linkIdx;
  }

  #addToAdjacency(entityIdx: number, linkIdx: LinkIdx): void {
    let list = this.#adjacency.get(entityIdx);
    if (!list) {
      list = [];
      this.#adjacency.set(entityIdx, list);
    }
    list.push(linkIdx);
  }

  addPending(endpointId: EntityId, linkIdx: LinkIdx): void {
    const pending = this.#pendingByEndpoint.get(endpointId) ?? [];
    pending.push(linkIdx);
    this.#pendingByEndpoint.set(endpointId, pending);
  }

  takePending(endpointId: EntityId): LinkIdx[] | undefined {
    const pending = this.#pendingByEndpoint.get(endpointId);
    if (pending) {
      this.#pendingByEndpoint.delete(endpointId);
    }
    return pending;
  }

  resolveEndpoint(
    linkIdx: LinkIdx,
    side: "left" | "right",
    entityIdx: EntityIdx,
  ): void {
    if (side === "left") {
      this.#leftIdx.set(linkIdx, entityIdx);
    } else {
      this.#rightIdx.set(linkIdx, entityIdx);
    }
    this.#addToAdjacency(entityIdx, linkIdx);
  }

  getLeft(linkIdx: number) {
    return this.#leftIdx.get(linkIdx);
  }

  getRight(linkIdx: number) {
    return this.#rightIdx.get(linkIdx);
  }

  getTypeSetIdx(linkIdx: number) {
    return this.#typeIdx.get(linkIdx);
  }

  /** The link's own entity index (a link is itself an entity). */
  getEntityIdx(linkIdx: number): EntityIdx {
    return this.#entityIdIdx.get(linkIdx);
  }

  /**
   * Collect all links touching an entity, with direction info.
   * O(degree) via the adjacency index.
   */
  linksForEntity(entityIdx: EntityIdx): LinkEndpoint[] {
    const linkIdxs = this.#adjacency.get(entityIdx);
    if (!linkIdxs) {
      return [];
    }

    const result: LinkEndpoint[] = [];
    for (const linkIdx of linkIdxs) {
      const left = this.#leftIdx.get(linkIdx);
      const right = this.#rightIdx.get(linkIdx);

      if (left === entityIdx && right !== -1) {
        result.push({
          linkIdx,
          otherIdx: right,
          typeSetIdx: this.#typeIdx.get(linkIdx),
          direction: "out",
        });
      } else if (right === entityIdx && left !== -1) {
        result.push({
          linkIdx,
          otherIdx: left,
          typeSetIdx: this.#typeIdx.get(linkIdx),
          direction: "in",
        });
      }
    }

    return result;
  }
}
