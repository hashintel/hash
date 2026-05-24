import { useMutation } from "@apollo/client";
import { useCallback } from "react";

import {
  extractEntityUuidFromEntityId,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";

import { queryEntitySubgraphQuery } from "../../graphql/queries/knowledge/entity.queries";
import { updatePage } from "../../graphql/queries/page.queries";
import { getBlockCollectionContentsStructuralQueryVariables } from "../../pages/shared/block-collection-contents";
import { getAccountPagesVariables } from "../../shared/account-pages-variables";

import type { UpdatePageMutation, UpdatePageMutationVariables } from "../../graphql/api-types.gen";
import type { EntityId } from "@blockprotocol/type-system";

export const useArchivePage = () => {
  const [updatePageFn, { loading }] = useMutation<UpdatePageMutation, UpdatePageMutationVariables>(
    updatePage,
    {
      awaitRefetchQueries: false,
    },
  );

  const getRefetchQueries = useCallback((pageEntityId: EntityId) => {
    const webId = extractWebIdFromEntityId(pageEntityId);
    return [
      {
        query: queryEntitySubgraphQuery,
        variables: getAccountPagesVariables({ webId }),
      },

      {
        query: queryEntitySubgraphQuery,
        variables: getBlockCollectionContentsStructuralQueryVariables(
          extractEntityUuidFromEntityId(pageEntityId),
        ),
      },
    ];
  }, []);

  const archivePage = useCallback(
    async (pageEntityId: EntityId) => {
      await updatePageFn({
        variables: {
          entityId: pageEntityId,
          updatedProperties: { archived: true },
        },
        refetchQueries: getRefetchQueries(pageEntityId),
      });
    },
    [updatePageFn, getRefetchQueries],
  );

  const unarchivePage = useCallback(
    async (pageEntityId: EntityId) => {
      await updatePageFn({
        variables: {
          entityId: pageEntityId,
          updatedProperties: { archived: false },
        },
        refetchQueries: getRefetchQueries(pageEntityId),
      });
    },
    [updatePageFn, getRefetchQueries],
  );

  return { archivePage, unarchivePage, loading } as const;
};
