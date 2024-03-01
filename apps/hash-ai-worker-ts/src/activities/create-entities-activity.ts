import type { GraphApi } from "@local/hash-graph-client";
import { AccountId, OwnedById } from "@local/hash-subgraph";

import {
  DereferencedEntityTypesByTypeId,
  InferenceState,
} from "./infer-entities/inference-types";
import { log } from "./infer-entities/log";
import { createEntities } from "./infer-entities/persist-entities/create-entities";
import { ProposedEntityCreationsByType } from "./infer-entities/persist-entities/generate-persist-entities-tools";

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
    /** @todo: handle creation failures and update candidates */
    creationFailures: _creationFailures,
    updateCandidates: _updateCandidates,
    unchangedEntities: _unchangedEntities,
  } = await createEntities({ ...params, log });

  return { creationSuccesses };
};
