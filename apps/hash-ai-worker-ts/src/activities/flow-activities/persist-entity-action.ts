import type { GraphApi } from "@local/hash-graph-client";
import {
  getSimplifiedActionInputs,
  type OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import { mapGraphApiEntityMetadataToMetadata } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { Entity } from "@local/hash-subgraph";
import { StatusCode } from "@local/status";

import type { FlowActionActivity } from "./types";

export const persistEntityAction: FlowActionActivity<{
  graphApiClient: GraphApi;
}> = async ({ inputs, graphApiClient, userAuthentication }) => {
  const { proposedEntity } = getSimplifiedActionInputs({
    inputs,
    actionType: "persistEntity",
  });

  const { data: entityMetadata } = await graphApiClient.createEntity(
    /** @todo: allow overriding this via an input */
    userAuthentication.actorId,
    {
      entityTypeIds: [proposedEntity.entityTypeId],
      properties: proposedEntity.properties,
      /** @todo: allow overriding this via an input */
      draft: true,
      /** @todo: allow overriding this via an input */
      ownedById: userAuthentication.actorId,
      relationships: [],
    },
  );

  const entity: Entity = {
    metadata: mapGraphApiEntityMetadataToMetadata(entityMetadata),
    properties: proposedEntity.properties,
  };

  return {
    code: StatusCode.Ok,
    contents: [
      {
        outputs: [
          {
            outputName:
              "persistedEntity" as OutputNameForAction<"persistEntity">,
            payload: {
              kind: "Entity",
              value: entity,
            },
          },
        ],
      },
    ],
  };
};
