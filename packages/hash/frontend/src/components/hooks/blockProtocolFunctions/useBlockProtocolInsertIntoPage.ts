import { useApolloClient, useMutation } from "@apollo/client";
import { useCallback } from "react";
import {
  InsertBlockIntoPageMutation,
  InsertBlockIntoPageMutationVariables,
} from "../../../graphql/apiTypes.gen";
import { insertBlockIntoPage } from "@hashintel/hash-shared/queries/page.queries";

export type InsertIntoPageFn = (
  variables: InsertBlockIntoPageMutationVariables
) => void;

export const useBlockProtocolInsertIntoPage = (): {
  insert: InsertIntoPageFn;
  insertLoading: boolean;
  insertError: any;
} => {
  const apolloClient = useApolloClient();

  // temporary hack to refetch page data after a mutation.
  // TODO: make caching of entities outside of GraphQL schema work
  // so that updates to those entities are reflected w/o doing this
  const onCompleted = () =>
    apolloClient
      .reFetchObservableQueries()
      .catch((err: any) =>
        console.error("Error when refetching all active queries: ", err)
      );

  const [insertFn, { loading, error }] = useMutation<
    InsertBlockIntoPageMutation,
    InsertBlockIntoPageMutationVariables
  >(insertBlockIntoPage, { onCompleted });

  const update: InsertIntoPageFn = useCallback(
    (variables) =>
      insertFn({
        variables,
      }),
    [insertFn]
  );

  return {
    insert: update,
    insertLoading: loading,
    insertError: error,
  };
};
