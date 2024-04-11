import type { GraphApi } from "@local/hash-graph-client";
import type { AccountId, OwnedById } from "@local/hash-subgraph";

import type {
  DereferencedEntityTypesByTypeId,
  InferenceState,
} from "./infer-entities/inference-types";
import { createEntities } from "./infer-entities/persist-entities/create-entities";
import type { ProposedEntityCreationsByType } from "./infer-entities/persist-entities/generate-persist-entities-tools";

export const createEntitiesActivity = async (params: {
  actorId: AccountId;
  createAsDraft: boolean;
  graphApiClient: GraphApi;
  inferenceState: InferenceState;
  proposedEntitiesByType: ProposedEntityCreationsByType;
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
