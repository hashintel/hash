import { VersionedUrl } from "@blockprotocol/graph";
import { ProposedEntity } from "@local/hash-isomorphic-utils/graphql/api-types.gen";

import {
  setErroredBadge,
  setLoadingBadge,
  setSuccessBadge,
} from "../../shared/badge";
import { InferEntitiesRequest } from "../../shared/messages";
import { queryApi } from "../../shared/query-api";
import { setInSessionStorage } from "../../shared/storage";

const inferEntitiesQuery = /* GraphQL */ `
  mutation inferEntities(
    $textInput: String!
    $entityTypeIds: [VersionedUrl!]!
  ) {
    inferEntities(
      allowEmptyResults: false
      entityTypeIds: $entityTypeIds
      maxTokens: 0
      model: "gpt-4-0613"
      temperature: 0
      textInput: $textInput
      validation: PARTIAL
    ) {
      entities {
        entityId
        entityTypeId
        properties
        linkData {
          leftEntityId
          rightEntityId
        }
      }
    }
  }
`;

const inferEntitiesApiCall = (
  textInput: string,
  entityTypeIds: VersionedUrl[],
) => {
  return queryApi(inferEntitiesQuery, {
    entityTypeIds,
    textInput: textInput.slice(0, 7900),
  }).then(
    ({ data }: { data: { inferEntities: { entities: ProposedEntity[] } } }) => {
      return data.inferEntities.entities;
    },
  );
};

export const inferEntities = async (message: InferEntitiesRequest) => {
  void setInSessionStorage("inferenceStatus", { status: "pending" });
  setLoadingBadge();

  try {
    const inferredEntities = await inferEntitiesApiCall(
      message.textInput,
      message.entityTypeIds,
    );
    setSuccessBadge(inferredEntities.length);
    void setInSessionStorage("inferenceStatus", {
      proposedEntities: inferredEntities,
      status: "success",
    });
  } catch (err) {
    setErroredBadge();
    void setInSessionStorage("inferenceStatus", {
      message: (err as Error).message,
      status: "error",
    });
  }
};
