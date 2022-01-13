import { useApolloClient, useMutation } from "@apollo/client";

import { BlockProtocolUpdateEntitiesFunction } from "blockprotocol";
import { updateEntity } from "@hashintel/hash-shared/queries/entity.queries";
import { useCallback } from "react";
import { updatePage } from "@hashintel/hash-shared/queries/page.queries";
import {
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
  UpdatePageMutation,
  UpdatePageMutationVariables,
} from "../../../graphql/apiTypes.gen";

export const useBlockProtocolUpdateEntities = (
  /** Providing accountId here saves blocks from having to know it */
  accountId: string,
): {
  updateEntities: BlockProtocolUpdateEntitiesFunction;
  updateEntitiesLoading: boolean;
  updateEntitiesError: any;
} => {
  const apolloClient = useApolloClient();

  // temporary hack to refetch page data after a mutation.
  // TODO: make caching of entities outside of GraphQL schema work
  // so that updates to those entities are reflected w/o doing this
  const onCompleted = () =>
    apolloClient.reFetchObservableQueries().catch((err: unknown) =>
      // eslint-disable-next-line no-console -- TODO: consider using logger
      console.error("Error when refetching all active queries: ", err),
    );

  const [
    updateEntityFn,
    { loading: updateEntityLoading, error: updateEntityError },
  ] = useMutation<UpdateEntityMutation, UpdateEntityMutationVariables>(
    updateEntity,
    { onCompleted },
  );

  const [updatePageFn, { loading: updatePageLoading, error: updatePageError }] =
    useMutation<UpdatePageMutation, UpdatePageMutationVariables>(updatePage, {
      onCompleted,
    });

  const updateEntities: BlockProtocolUpdateEntitiesFunction = useCallback(
    async (actions) =>
      Promise.all(
        actions.map(async (action) =>
          (action.entityTypeId === "Page" ? updatePageFn : updateEntityFn)({
            variables: {
              entityId: action.entityId,
              properties: action.data,
              accountId,
            },
          }).then(
            ({ data }) =>
              data &&
              ("updatePage" in data ? data.updatePage : data.updateEntity),
          ),
        ),
      ),
    [accountId, updateEntityFn, updatePageFn],
  );

  const updateEntitiesLoading = updateEntityLoading || updatePageLoading;
  const updateEntitiesError = updateEntityError ?? updatePageError;

  return {
    updateEntities,
    updateEntitiesLoading,
    updateEntitiesError,
  };
};
