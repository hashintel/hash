import { useApolloClient, useMutation } from "@apollo/client";

import {
  BlockProtocolEntityType,
  BlockProtocolUpdateEntityTypesFunction,
} from "blockprotocol";
import { useCallback } from "react";
import {
  UpdateEntityTypeMutation,
  UpdateEntityTypeMutationVariables,
} from "../../../graphql/apiTypes.gen";
import { updateEntityTypeMutation } from "../../../graphql/queries/entityType.queries";

export const useBlockProtocolUpdateEntityType = (): {
  updateEntityTypes: BlockProtocolUpdateEntityTypesFunction;
  updateEntityTypesLoading: boolean;
  updateEntityTypesError: any;
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

  const updateEntityTypes: BlockProtocolUpdateEntityTypesFunction = useCallback(
    async (actions) => {
      const results: BlockProtocolEntityType[] = [];
      // TODO: Support multiple actions in one GraphQL mutation for transaction integrity and better status reporting
      for (const { accountId, entityId, schema } of actions) {
        if (!accountId) {
          throw new Error("updateEntityTypes needs to be passed an accountId");
        }

        const variables: UpdateEntityTypeMutationVariables = {
          entityId,
          accountId,
          schema,
        };
        const { data, errors } = await runUpdateEntityTypeMutation({
          variables,
        });

        if (!data) {
          throw new Error(
            errors?.[0].message || "Could not update entity type",
          );
        }

        results.push({
          entityTypeId: data.updateEntityType.entityId,
          ...data.updateEntityType.properties,
        });
      }
      return results;
    },
    [runUpdateEntityTypeMutation],
  );

  return {
    updateEntityTypes,
    updateEntityTypesLoading,
    updateEntityTypesError,
  };
};
