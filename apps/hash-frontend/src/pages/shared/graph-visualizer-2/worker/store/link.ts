/**
 * Link storage: columnar arrays for endpoints, link type, and entity
 * index, plus an adjacency index and a pending-endpoint queue for
 * frontier resolution.
 */
import { LinkId } from "../../ids";
import { Column } from "../collections/column";

import type { EntityIndex, TypeSetId } from "../../ids";
import type { EntityId } from "@blockprotocol/type-system";

const INITIAL_CAPACITY = 1024;

export interface LinkEndpoint {
  readonly linkId: LinkId;
  readonly otherId: EntityIndex;
  readonly typeSetId: TypeSetId;
  readonly direction: "out" | "in";
}

/** A link endpoint awaiting the arrival of the entity it references. */
export interface PendingEndpoint {
  readonly linkId: LinkId;
  readonly side: "left" | "right";
}

/**
 * An endpoint that flipped from `-1` to a real index since the last
 * {@link LinkStore.drainResolvedEndpoints}. Consumers that cache per-link
 * derived state (the edge aggregator) need the exact side to reconstruct
 * the values the link carried when they last saw it.
 */
export interface ResolvedEndpoint {
  readonly linkId: LinkId;
  readonly side: "left" | "right";
}

export class LinkStore {
  readonly #left: Column<Int32Array, EntityIndex | -1>;
  readonly #right: Column<Int32Array, EntityIndex | -1>;
  readonly #type: Column<Uint32Array, TypeSetId>;
  readonly #entity: Column<Uint32Array, EntityIndex>;
  readonly #pending: Map<EntityId, PendingEndpoint[]>;
  readonly #adjacency: Map<number, LinkId[]>;
  #resolvedLog: ResolvedEndpoint[] = [];

  constructor() {
    this.#left = new Column(Int32Array, INITIAL_CAPACITY);
    this.#right = new Column(Int32Array, INITIAL_CAPACITY);
    this.#type = new Column(Uint32Array, INITIAL_CAPACITY);
    this.#entity = new Column(Uint32Array, INITIAL_CAPACITY);
    this.#pending = new Map();
    this.#adjacency = new Map();
  }

  get count(): number {
    return this.#left.length;
  }

  /**
   * Record a link. Endpoints are -1 when the target entity hasn't been
   * ingested yet (frontier case).
   */
  insert(
    left: EntityIndex | -1,
    right: EntityIndex | -1,
    typeSetId: TypeSetId,
    entityIndex: EntityIndex,
  ): LinkId {
    this.#left.push(left);
    this.#right.push(right);
    this.#type.push(typeSetId);
    this.#entity.push(entityIndex);

    const id = LinkId(this.#left.length - 1);

    if (left !== -1) {
      this.#addToAdjacency(left, id);
    }
    if (right !== -1) {
      this.#addToAdjacency(right, id);
    }

    return id;
  }

  #addToAdjacency(entityIndex: number, linkId: LinkId): void {
    let list = this.#adjacency.get(entityIndex);
    if (!list) {
      list = [];
      this.#adjacency.set(entityIndex, list);
    }
    list.push(linkId);
  }

  addPending(
    endpointId: EntityId,
    linkId: LinkId,
    side: "left" | "right",
  ): void {
    const pending = this.#pending.get(endpointId) ?? [];
    pending.push({ linkId, side });
    this.#pending.set(endpointId, pending);
  }

  /** Remove and return pending endpoints for an entity, or `undefined` if none. */
  takePending(endpointId: EntityId): PendingEndpoint[] | undefined {
    const pending = this.#pending.get(endpointId);
    if (pending) {
      this.#pending.delete(endpointId);
    }
    return pending;
  }

  /**
   * Resolve a previously-pending endpoint and add it to the adjacency index.
   *
   * Only the recorded pending side is written; the other endpoint keeps its
   * value. Resolutions are logged for {@link drainResolvedEndpoints} so that
   * incremental consumers can undo the classification the link had while the
   * side was still `-1`.
   */
  resolveEndpoint(
    linkId: LinkId,
    side: "left" | "right",
    entityIndex: EntityIndex,
  ): void {
    if (side === "left") {
      this.#left.set(linkId, entityIndex);
    } else {
      this.#right.set(linkId, entityIndex);
    }
    this.#addToAdjacency(entityIndex, linkId);
    this.#resolvedLog.push({ linkId, side });
  }

  /** Endpoint resolutions since the previous drain. Draining resets the log. */
  drainResolvedEndpoints(): ResolvedEndpoint[] {
    const drained = this.#resolvedLog;
    this.#resolvedLog = [];
    return drained;
  }

  getLeft(linkId: number): EntityIndex | -1 {
    return this.#left.get(linkId);
  }

  getRight(linkId: number): EntityIndex | -1 {
    return this.#right.get(linkId);
  }

  getTypeSetId(linkId: number): TypeSetId {
    return this.#type.get(linkId);
  }

  /** The link's own entity index (a link is itself an entity). */
  getEntityIndex(linkId: number): EntityIndex {
    return this.#entity.get(linkId);
  }

  degreeOf(entityIndex: EntityIndex): number {
    return this.#adjacency.get(entityIndex)?.length ?? 0;
  }

  /** All links touching an entity, with direction. O(degree). */
  *linksFor(
    entityIndex: EntityIndex,
  ): Generator<LinkEndpoint, void, undefined> {
    const linkIds = this.#adjacency.get(entityIndex);
    if (!linkIds) {
      return;
    }

    for (const linkId of linkIds) {
      const left = this.#left.get(linkId);
      const right = this.#right.get(linkId);

      if (left === entityIndex && right !== -1) {
        yield {
          linkId,
          otherId: right,
          typeSetId: this.#type.get(linkId),
          direction: "out",
        };
      } else if (right === entityIndex && left !== -1) {
        yield {
          linkId,
          otherId: left,
          typeSetId: this.#type.get(linkId),
          direction: "in",
        };
      }
    }
  }
}
