import { uniq } from "lodash";

import { Connection } from "./types";
import { getEntityHistory } from "./entity";
import { getEntityOutgoingLinks } from "./link/getEntityOutgoingLinks";
import { EntityVersion, Graph } from "../adapter";
import { DefaultMap } from "../../util";

/*
======================================================================
+++++++++++++++++++++++ Implied Version History ++++++++++++++++++++++
======================================================================

When an entity links to another entity by referencing its entityId, rather than
its entityVersionId, the possible set of sub-graphs rooted at the reference entity grows
in size as new versions of the linked entities are created -- we call this set the
"implied entity history". This source file, with its `getImpliedEntityHistory` function,
is repsonsible for determining the implied history for a given entity.

To illustrate how the implied history is derived, consider the diagram below showing
the version timeline of three entities: A, B and C. We wish to determine the implied
entity history of the sub-graph rooted at entity A.

             │                  │                │
             │                  │                │
             B1                 │                │
             │                  │                │
             │                  │                │
             │                  │                │
    ▲        │                  │                │
    │        │◄──────────────── A1 ─────────────►│
time│        │                  │                │
    │        │                  │                │
             │                  │                C1
             │                  │                │
             │                  │                │
             │                  │                │
             │                  │                │
             B0                 │                │
             │                  A0 ─────────────►│
             │                  │                │
             │                  │                C0
             │                  │                │

             B                  A                C

  1. Starting at the first version of entity A (A0), we see that A0 links to entity C.
     The earliest version of entity C is C0. C does not link to any other entities,
     therefore, the first implied version sub-graph rooted at entity A consists of:
     {A0, C0}. C0 is the oldest entity version in this sub-graph, so we make a checkpoint
     on the link from A to C at the next version, C1.
  2. The checkpoint for entity A is still at A0, so it again is the root for the next
     iteration. As before, A0 links to entity C which has its checkpoint at C1. Therefore,
     the second sub-graph in the implied history timeline consists of {A0, C1}. A0 is
     the oldest entity in this sub-graph, so its checkpoint is incremented to A1.
  3. A1 is the root at this iteration, which we can see, links to entities B and C. The
     checkpoint for B is at B0, and the checkpoint for C is at C1; therefore, the next
     sub-graph consists of {A1, B0, C1}. B0 is the oldest entity in this sub-graph, so
     its checkpoint is incremented to B1.
  4. By similar reasoning as before, the next sub-graph consists of {A1, B1, C1}. The
     checkpoint cannot be incremented for any entity, so iteration ends here, and the
     implied version history of entity A consists of four sub-graphs:
       [
         {A0, C0},
         {A0, C1},
         {A1, B0, C1},
         {A1, B1, C1},
       ]

The example illustrated above represents the simple case of a depth-1 sub-graph. In
general, the sub-graph may be of arbitrary depth. To handle this general case, we can
perform a breadth-first search of the graph, where on each iteration, there is a single
"reference" entity about which its implied links are determined as explained above.
*/

/** @todo: deprecate this type, and use the DbLink type instead */
type OutgoingLink = {
  accountId: string;
  entityId: string;
  entityVersionId?: string;
  validForSourceEntityVersionIds: Set<string>;
};

class CheckpointManager {
  checkpoints: DefaultMap<string, Map<string, number>>;
  rootCheckpoint: number;

  constructor() {
    this.checkpoints = new DefaultMap(() => new Map());
    this.rootCheckpoint = 0;
  }

  /** Get the value of a checkpoint. */
  get = (sourceEntityId: string, destinationEntityId: string) => {
    return this.checkpoints.get(sourceEntityId).get(destinationEntityId) || 0;
  };

  /** Set the value of a checkpoint. */
  set = (
    sourceEntityId: string,
    destinationEntityId: string,
    checkpoint: number,
  ) => {
    this.checkpoints.get(sourceEntityId).set(destinationEntityId, checkpoint);
  };

  /** Increment and return the new value of a checkpoint. */
  increment = (sourceEntityId: string, destinationEntityId: string) => {
    const checkpoint = this.get(sourceEntityId, destinationEntityId);
    this.set(sourceEntityId, destinationEntityId, checkpoint + 1);
    return checkpoint + 1;
  };

  /** Get the value of the root checkpoint. */
  getRoot = () => {
    return this.rootCheckpoint;
  };

  /** Set the value of the root checkpoint. */
  setRoot = (checkpoint: number) => {
    this.rootCheckpoint = checkpoint;
  };

  /** Increment and return the new value of the root checkpoint. */
  incrementRoot = () => {
    this.rootCheckpoint += 1;
    return this.rootCheckpoint;
  };
}

// @todo: add optional bounds to restrict the implied history within an interval.
// @todo: we may need to paginate this function.
// @todo provision for fixed links has been removed – remove related code when fixing history
/**
 * Get the implied entity history of a given entity.
 * @param conn a connection to the database.
 * @param params.accountId the account that the reference entity resides in.
 * @param params.entityId the reference entity.
 * @returns an array of `Graph`s, ordered in time, representing the sub-graph of each
 * implied version of the reference entity.
 */
export const getImpliedEntityHistory = async (
  conn: Connection,
  params: {
    accountId: string;
    entityId: string;
  },
) => {
  // Find the entityIds of all entities in the sub-graph reachable from the root node.
  // @todo: we may be able to turn this into a single recursive SQL query.
  const root = params;
  const entityRefs = [root];
  const graph = new Map<string, OutgoingLink[]>();
  let slice = [root];
  while (slice.length > 0) {
    const entityLinks = await Promise.all(
      slice.map((ref) => getEntityOutgoingLinks(conn, ref)),
    ).then((nestedLinks) =>
      nestedLinks.map((links) =>
        links.map(
          (link): OutgoingLink => ({
            accountId: link.sourceAccountId,
            entityId: link.sourceEntityId,
            /** @todo: fix this type when fixing implied history resolver */
            validForSourceEntityVersionIds: (link as any)
              .sourceEntityVersionIds,
          }),
        ),
      ),
    );
    for (const [i, links] of entityLinks.entries()) {
      graph.set(slice[i]!.entityId, links);
    }
    slice = uniq(
      entityLinks.flat().filter(({ entityId }) => !graph.has(entityId)),
    );
    entityRefs.push(...slice);
  }

  // Get all version references for each entity in the root node's sub-graph
  const entityVersions = new Map(
    (
      await Promise.all(
        entityRefs.map((ref) =>
          getEntityHistory(conn, { ...ref, order: "asc" }),
        ),
      )
    ).map((versions, i): [string, EntityVersion[]] => [
      entityRefs[i]!.entityId,
      versions,
    ]),
  );

  // A mapping from entityVersionId to its corresponding position in the entity timeline.
  // We pre-compute this as an optimization
  const timelinePos = new Map<string, number>();
  for (const versions of entityVersions.values()) {
    for (const [i, version] of versions.entries()) {
      timelinePos.set(version.entityVersionId, i);
    }
  }

  // Find all implied version history sub-graphs for the root node.
  const checkpoints = new CheckpointManager();
  const impliedHistorySubGraphs: Graph[] = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rootVersion = entityVersions.get(root.entityId)![
      checkpoints.getRoot()
    ]!;
    const subGraph: Graph = {
      entities: [],
      links: [],
      rootEntityVersionId: rootVersion.entityVersionId,
    };

    // Perform a breadth-first search starting at rootVersion
    const stack = [rootVersion];
    while (stack.length > 0) {
      // This is the reference entity for this iteration. We will determine the implied
      // entity versions it links to.
      const ref = stack.pop()!;
      subGraph.entities.push(ref);

      // Get the links made by this particular version of the reference entity
      const refLinks = graph
        .get(ref.entityId)!
        .filter((link) =>
          link.validForSourceEntityVersionIds.has(ref.entityVersionId),
        );

      // For each link made by the reference entity, if it's a non-fixed link (i.e. it's
      // made on entityId), choose the checkpointed version; or if it's a fixed link,
      // choose the specified version.
      for (const link of refLinks) {
        const linkedVersions = entityVersions.get(link.entityId)!;
        const linkedVersion = link.entityVersionId
          ? linkedVersions.find(
              (ver) => ver.entityVersionId === link.entityVersionId,
            )!
          : linkedVersions[checkpoints.get(ref.entityId, link.entityId)]!;

        // If the link is fixed, and the position of the specified version in its timeline
        // is after the checkpointed version of this entity, then we need to update the
        // checkpoint.
        if (link.entityVersionId) {
          const pos = timelinePos.get(link.entityVersionId)!;
          if (pos >= checkpoints.get(ref.entityId, link.entityId)) {
            checkpoints.set(ref.entityId, link.entityId, pos);
          }
        }

        stack.push(linkedVersion);

        subGraph.links.push({
          src: ref,
          dst: linkedVersion,
          fixed: link.entityVersionId !== undefined,
        });
      }
    }

    impliedHistorySubGraphs.push(subGraph);

    // Find the oldest entity version in this sub-graph, which is not the last version
    // in its timeline, and mark a checkpoint on the source entities which reference it
    // with a non-fixed link. Iteration ends here if such an entity version cannot be
    // found.
    const hasNextVersion = (args: {
      entityId: string;
      entityVersionId: string;
    }) =>
      timelinePos.get(args.entityVersionId)! <
      entityVersions.get(args.entityId)!.length - 1;
    let oldest: EntityVersion | null = null;
    for (const ver of subGraph.entities) {
      if (
        (!oldest || ver.updatedAt < oldest.updatedAt) &&
        hasNextVersion(ver)
      ) {
        oldest = ver;
      }
    }
    if (!oldest) {
      break;
    }
    if (oldest.entityId === rootVersion.entityId) {
      checkpoints.incrementRoot();
    }
    for (const { src, dst, fixed } of subGraph.links) {
      if (dst.entityVersionId === oldest.entityVersionId && !fixed) {
        checkpoints.increment(src.entityId, dst.entityId);
      }
    }
  }

  return impliedHistorySubGraphs;
};
