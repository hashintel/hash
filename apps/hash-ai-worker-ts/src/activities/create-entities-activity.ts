import type { VersionedUrl } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import type { ProposedEntity } from "@local/hash-isomorphic-utils/ai-inference-types";
import type { AccountId, OwnedById } from "@local/hash-subgraph";

import type {
  DereferencedEntityTypesByTypeId,
  InferenceState,
} from "./infer-entities/inference-types";
import { createEntities } from "./infer-entities/persist-entities/create-entities";

export const createEntitiesActivity = async (params: {
  actorId: AccountId;
  createAsDraft: boolean;
  graphApiClient: GraphApi;
  inferenceState: InferenceState;
  proposedEntitiesByType: Record<VersionedUrl, ProposedEntity[]>;
  requestedEntityTypes: DereferencedEntityTypesByTypeId;
  ownedById: OwnedById;
}) => {
  const {
    creationSuccesses,
    unchangedEntities,
    /** @todo: handle creation failures and update candidates */
    creationFailures: _creationFailures,
    updateCandidates: _updateCandidates,
  } = await createEntities(params);

  return { creationSuccesses, unchangedEntities };
};
