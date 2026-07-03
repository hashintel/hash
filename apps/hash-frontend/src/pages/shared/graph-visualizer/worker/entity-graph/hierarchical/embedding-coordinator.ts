/**
 * Embedding-driven subdivision and cluster naming.
 *
 * When a subdivision produces deterministic entity buckets, this requests a
 * server-side embedding clustering (requests are drained after each
 * structure frame dispatch) and, when the result lands, replaces the
 * buckets with the embedding groups. Both bucket and embedding children get
 * distinctive-feature names computed off the job scheduler, so the
 * placeholder commit paints first and the relabel lands as a label-only
 * re-emit.
 */
import { ClusterId } from "../../../ids";
import { createClusterFeatureSource } from "../../hierarchy/cluster-feature-source";
import { nameClustersByDistinctiveFeatures } from "../../hierarchy/distinctive-cluster-label";
import { entityIdsForCluster } from "../cluster-membership";

import type { VizConfig } from "../../../config";
import type { ClusterNode, ClusterTree } from "../../hierarchy/cluster-tree";
import type { ClusterMembers } from "../../hierarchy/distinctive-cluster-label";
import type { EmbeddingClusteringNeededMessage } from "../../protocol";
import type { EntityStore } from "../store/entity";
import type { LinkStore } from "../store/link";
import type { PropertyStore } from "../store/property";
import type { TypeRegistry } from "../../store/type-registry";
import type { TypeSetStore } from "../store/type-set";
import type { JobScheduler } from "../../core/schedulers";
import type { EntityId } from "@blockprotocol/type-system";

export interface EmbeddingCoordinatorDependencies {
  readonly config: VizConfig;
  readonly clusterTree: ClusterTree;
  readonly entities: EntityStore;
  readonly links: LinkStore;
  readonly properties: PropertyStore;
  readonly typeSets: TypeSetStore;
  readonly types: TypeRegistry;
  readonly jobs: JobScheduler;
  /** The cluster tree changed shape; the next commit must not no-op. */
  readonly bumpClusterEpoch: () => void;
  /** Re-emit the current topology with fresh labels (no cut recompute). */
  readonly recommitLabelsOnly: () => void;
}

export class EmbeddingCoordinator {
  readonly #dependencies: EmbeddingCoordinatorDependencies;
  readonly #pendingRequests: EmbeddingClusteringNeededMessage[] = [];

  constructor(dependencies: EmbeddingCoordinatorDependencies) {
    this.#dependencies = dependencies;
  }

  /** Returns and clears embedding-clustering requests queued during subdivision. */
  drainRequests(): EmbeddingClusteringNeededMessage[] {
    if (this.#pendingRequests.length === 0) {
      return [];
    }

    const requests = [...this.#pendingRequests];
    this.#pendingRequests.length = 0;

    return requests;
  }

  /**
   * After a subdivision produced children for `node`: request an embedding
   * upgrade when the children are deterministic entity buckets, and give
   * fallback groups (community + entity-bucket) distinctive-feature names so
   * they carry a meaningful name before (or without) embeddings. Type-set
   * children are excluded (the type labeler names those). If embeddings
   * arrive later they replace these children and re-name via
   * {@link applyResult}.
   */
  afterSubdivide(node: ClusterNode): void {
    const { config, clusterTree, entities, typeSets } = this.#dependencies;
    const hasEntityBuckets = node.children.some(
      (child) => child.kind === "entity-bucket",
    );

    if (
      hasEntityBuckets &&
      clusterTree.needsEmbeddingSubdivision(node, config)
    ) {
      const entityIds = [...entityIdsForCluster(node, typeSets, entities)];
      const targetSize = Math.floor(
        config.entityRevealMax * config.embeddingTargetLeafFillRatio,
      );
      const clusterCount = Math.max(
        2,
        Math.min(
          config.embeddingMaxK,
          Math.ceil(entityIds.length / targetSize),
        ),
      );

      clusterTree.markSubdivisionRequested(node.id);
      this.#pendingRequests.push({
        type: "EMBEDDING_CLUSTERING_NEEDED",
        clusterId: node.id,
        entityIds,
        clusterCount,
      });
    }

    const fallbackGroups: ClusterMembers[] = [];
    for (const child of node.children) {
      if (
        (child.kind === "community" || child.kind === "entity-bucket") &&
        child.membership.source === "direct"
      ) {
        fallbackGroups.push({
          childId: child.id,
          memberIdxs: child.membership.members.subarray().view,
        });
      }
    }

    this.scheduleDistinctiveFeatureNaming(fallbackGroups);
  }

  /** Apply server-side embedding clustering results. */
  applyResult(
    clusterId: ClusterId,
    clusters: readonly {
      readonly clusterId: number;
      readonly entityIds: readonly string[];
    }[],
  ): void {
    const { clusterTree, entities } = this.#dependencies;
    const assignments = clusters.map((embeddingCluster) => {
      // Compact unknown ids away. Leaving a slot at its Int32Array default of
      // 0 would silently claim entity index 0 as a member of every cluster
      // containing an id the store has not interned.
      const scratch = new Int32Array(embeddingCluster.entityIds.length);
      let matched = 0;

      for (const rawId of embeddingCluster.entityIds) {
        // Embedding payloads carry string EntityIds; cast matches the store
        // lookup key type. Unknown ids are dropped below.
        const entityIdx = entities.lookup(rawId as EntityId);
        if (entityIdx !== undefined) {
          scratch[matched] = entityIdx;
          matched += 1;
        }
      }

      return {
        childId: ClusterId(
          `${clusterId}:embedding:${embeddingCluster.clusterId}`,
        ),
        count: matched,
        memberIdxs: scratch.subarray(0, matched),
      };
    });

    clusterTree.applyEmbeddingResult(clusterId, assignments);
    this.#dependencies.bumpClusterEpoch();

    // The children render immediately with their "Similar group n" placeholder (set in
    // ClusterTree.applyEmbeddingResult); the relabel lands later off the job scheduler.
    this.scheduleDistinctiveFeatureNaming(assignments);
  }

  /**
   * Schedule distinctive-feature naming for sibling child clusters (embedding
   * groups or fallback buckets). Names from a unified feature space: exact
   * property values, numeric/date ranges, and link/target types. Deferred onto
   * the job scheduler (O(members x features)); the placeholder commit paints
   * first, then the relabel lands once the scan completes.
   */
  scheduleDistinctiveFeatureNaming(groups: readonly ClusterMembers[]): void {
    if (groups.length === 0) {
      return;
    }

    const { properties, links, entities, typeSets, types, clusterTree } =
      this.#dependencies;
    this.#dependencies.jobs.schedule(() => {
      const labels = nameClustersByDistinctiveFeatures(
        groups,
        createClusterFeatureSource({
          properties,
          links,
          entities,
          typeSets,
          types,
        }),
      );

      if (labels.size === 0) {
        return;
      }

      for (const [childId, label] of labels) {
        clusterTree.setLabelText(childId, label);
      }

      // Labels don't affect the cut, so re-emit the current topology with the
      // fresh labels rather than paying a full cut + aggregation rebuild.
      this.#dependencies.recommitLabelsOnly();
    });
  }
}
