import { useApolloClient, useMutation } from "@apollo/client";

import { BlockProtocolUpdateEntityTypeFn } from "@hashintel/block-protocol";
import { useCallback } from "react";
import {
  UpdateEntityTypeMutation,
  UpdateEntityTypeMutationVariables,
} from "../../../graphql/apiTypes.gen";
import { getAccountEntityTypes } from "../../../graphql/queries/account.queries";
import { updateEntityTypeMutation } from "../../../graphql/queries/entityType.queries";

export const useBlockProtocolUpdateEntityType = (
  /** Providing accountId here saves blocks from having to know it */
  accountId: string,
): {
  updateEntityType: BlockProtocolUpdateEntityTypeFn;
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
    updateEntityTypeFn,
    { loading: updateEntityTypeLoading, error: updateEntityTypeError },
  ] = useMutation<UpdateEntityTypeMutation, UpdateEntityTypeMutationVariables>(
    updateEntityTypeMutation,
    {
      onCompleted,
    },
  );

  const updateEntityType: BlockProtocolUpdateEntityTypeFn = useCallback(
    async ({ entityId, schema }) => {
      const variables: UpdateEntityTypeMutationVariables = {
        entityId,
        accountId,
        schema,
      };
      return updateEntityTypeFn({ variables }).then(({ data, errors }) => {
        if (!data) {
          throw new Error(
            errors?.[0].message || "Could not update entity type",
          );
        }
        return {
          entityTypeId: data.updateEntityType.entityId,
          ...data.updateEntityType.properties,
        };
      });
    },
    [accountId, updateEntityTypeFn],
  );

  return {
    updateEntityType,
    updateEntityTypeLoading,
    updateEntityTypeError,
  };
};
