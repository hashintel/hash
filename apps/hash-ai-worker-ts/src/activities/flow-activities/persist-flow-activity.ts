import type {
  ActorEntityUuid,
  OriginProvenance,
  ProvidedEntityEditionProvenance,
  WebId,
} from "@blockprotocol/type-system";
import { getFlowRunEntityById } from "@local/hash-backend-utils/flows";
import { HashEntity } from "@local/hash-graph-sdk/entity";
import { mapFlowRunToEntityProperties } from "@local/hash-isomorphic-utils/flows/mappings";
import type { LocalFlowRun } from "@local/hash-isomorphic-utils/flows/types";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { FlowRun } from "@local/hash-isomorphic-utils/system-types/shared";

import { getFlowContext } from "../shared/get-flow-context.js";
import { graphApiClient } from "../shared/graph-api-client.js";

type PersistFlowActivityParams = {
  flow: LocalFlowRun;
  userAuthentication: { actorId: ActorEntityUuid };
  webId: WebId;
};

export const persistFlowActivity = async (
  params: PersistFlowActivityParams,
) => {
  const { flow, userAuthentication, webId } = params;

  const { flowRunId } = flow;

  const { flowEntityId, stepId } = await getFlowContext();

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
      stepIds: [stepId],
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
