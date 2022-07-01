import { useApolloClient, useMutation } from "@apollo/client";

import { EmbedderGraphMessageCallbacks } from "@blockprotocol/graph";
import { useCallback } from "react";
import {
  UpdateEntityTypeMutation,
  UpdateEntityTypeMutationVariables,
} from "../../../graphql/apiTypes.gen";
import { updateEntityTypeMutation } from "../../../graphql/queries/entityType.queries";

export const useBlockProtocolUpdateEntityType = (): {
  updateEntityType: EmbedderGraphMessageCallbacks["updateEntityType"];
  updateEntityTypeLoading: boolean;
  updateEntityTypeError: any;
} => {
  const apolloClient = useApolloClient();

  // temporary hack to refetch page data after a mutation.
  // TODO: make caching of entities outside of GraphQL schema work
  // so that updates to those entities are reflected w/o doing this
  const onCompleted = () =>
    apolloClient.reFetchObservableQueries().catch((err: any) =>
      // eslint-disable-next-line no-console -- TODO: consider using logger
      console.error("Error when refetching all active queries: ", err),
    );

  const [
    runUpdateEntityTypeMutation,
    { loading: updateEntityTypesLoading, error: updateEntityTypesError },
  ] = useMutation<UpdateEntityTypeMutation, UpdateEntityTypeMutationVariables>(
    updateEntityTypeMutation,
    {
      onCompleted,
    },
  );

  const updateEntityType: EmbedderGraphMessageCallbacks["updateEntityType"] =
    useCallback(
      async ({ data }) => {
        if (!data) {
          return {
            errors: [
              {
                code: "INVALID_INPUT",
                message: "'data' must be provided for updateEntityType",
              },
            ],
          };
        }

        const results: BlockProtocolEntityType[] = [];
        // TODO: Support multiple actions in one GraphQL mutation for transaction integrity and better status reporting
        for (const { accountId, entityTypeId, schema } of actions) {
          if (!accountId) {
            throw new Error("updateEntityType needs to be passed an accountId");
          }

          const variables: UpdateEntityTypeMutationVariables = {
            entityId: entityTypeId,
            accountId,
            schema,
          };
          const { data, errors } = await runUpdateEntityTypeMutation({
            variables,
          });

          if (!data) {
            throw new Error(
              errors?.[0]!.message || "Could not update entity type",
            );
          }

          results.push({
            accountId: data.updateEntityType.accountId,
            entityTypeId: data.updateEntityType.entityId,
            ...data.updateEntityType.properties,
          });
        }
        return results;
      },
      [runUpdateEntityTypeMutation],
    );

  return {
    updateEntityType,
    updateEntityTypeLoading,
    updateEntityTypeError,
  };
};
