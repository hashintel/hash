import type {
  ActorEntityUuid,
  EntityId,
  OriginProvenance,
  ProvidedEntityEditionProvenance,
  WebId,
} from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import { HashEntity } from "@local/hash-graph-sdk/entity";
import { mapFlowRunToEntityProperties } from "@local/hash-isomorphic-utils/flows/mappings";
import type { LocalFlowRun } from "@local/hash-isomorphic-utils/flows/types";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { FlowRun } from "@local/hash-isomorphic-utils/system-types/shared";

import { getFlowRunEntityById } from "../../shared/get-flow-run-entity-by-id.js";

export type PersistFlowActivityParams = {
  flow: LocalFlowRun;
  flowEntityId: EntityId;
  stepIds: string[];
  userAuthentication: { actorId: ActorEntityUuid };
  webId: WebId;
};

export const persistFlowActivity = async (
  params: PersistFlowActivityParams & { graphApiClient: GraphApi },
) => {
  const {
    flow,
    flowEntityId,
    graphApiClient,
    stepIds,
    userAuthentication,
    webId,
  } = params;

  const { flowRunId } = flow;

  const flowRunProperties = mapFlowRunToEntityProperties(flow);

  const existingFlowEntity = await getFlowRunEntityById({
    flowRunId,
    graphApiClient,
    userAuthentication,
  });

  const provenance: ProvidedEntityEditionProvenance = {
    actorType: "machine",
    origin: {
      type: "flow",
      id: flowEntityId,
      stepIds,
    } satisfies OriginProvenance,
  };

  if (existingFlowEntity) {
    await existingFlowEntity.patch(graphApiClient, userAuthentication, {
      propertyPatches: [
        {
          op: "replace",
          path: [],
          property: flowRunProperties,
        },
      ],
      provenance,
    });
  } else {
    await HashEntity.create<FlowRun>(graphApiClient, userAuthentication, {
      webId,
      entityUuid: flowRunId,
      entityTypeIds: [systemEntityTypes.flowRun.entityTypeId],
      properties: flowRunProperties,
      provenance,
      draft: false,
    });
  }
};
