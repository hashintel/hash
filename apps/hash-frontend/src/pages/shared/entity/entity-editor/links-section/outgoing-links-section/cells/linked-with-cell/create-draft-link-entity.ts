import { currentTimestamp } from "@blockprotocol/type-system";
import { HashEntity } from "@local/hash-graph-sdk/entity";

import type {
  ActorEntityUuid,
  EntityId,
  VersionedUrl,
} from "@blockprotocol/type-system";

/**
 * @todo - This is unsafe, and should be refactored to return a new type `DraftEntity`, so that we aren't
 *   breaking invariants and constraints. Having a disjoint type will let us rely on `tsc` properly and avoid casts
 *   and empty placeholder values below
 *   see https://linear.app/hash/issue/H-1083/draft-entities
 */
export const createDraftLinkEntity = ({
  rightEntityId,
  leftEntityId,
  linkEntityTypeId,
}: {
  rightEntityId: EntityId;
  leftEntityId: EntityId;
  linkEntityTypeId: VersionedUrl;
}): HashEntity =>
  new HashEntity({
    properties: {},
    linkData: { rightEntityId, leftEntityId },
    metadata: {
      archived: false,
      recordId: { editionId: "", entityId: `draft~${Date.now()}` as EntityId },
      entityTypeIds: [linkEntityTypeId],
      provenance: {
        createdById: "" as ActorEntityUuid,
        createdAtTransactionTime: currentTimestamp(),
        createdAtDecisionTime: currentTimestamp(),
        edition: {
          createdById: "" as ActorEntityUuid,
          actorType: "user",
          origin: { type: "api" },
        },
      },
      temporalVersioning: {
        decisionTime: {
          start: {
            kind: "inclusive",
            limit: currentTimestamp(),
          },
          end: {
            kind: "unbounded",
          },
        },
        transactionTime: {
          start: {
            kind: "inclusive",
            limit: currentTimestamp(),
          },
          end: {
            kind: "unbounded",
          },
        },
      },
    },
  });
