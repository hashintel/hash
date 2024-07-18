import { useMutation } from "@apollo/client";
import type { EntityId } from "@local/hash-graph-types/entity";
import {
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";
import { useCallback, useContext } from "react";

import type {
  UpdatePageMutation,
  UpdatePageMutationVariables,
} from "../../graphql/api-types.gen";
import { getEntitySubgraphQuery } from "../../graphql/queries/knowledge/entity.queries";
import { updatePage } from "../../graphql/queries/page.queries";
import { getBlockCollectionContentsStructuralQueryVariables } from "../../pages/shared/block-collection-contents";
import { getAccountPagesVariables } from "../../shared/account-pages-variables";
import { EntityTypeEntitiesContext } from "../../shared/entity-type-entities-context";

export const useArchivePage = () => {
  const entityTypeEntitiesContext = useContext(EntityTypeEntitiesContext);

  const [updatePageFn, { loading }] = useMutation<
    UpdatePageMutation,
    UpdatePageMutationVariables
  >(updatePage, {
    awaitRefetchQueries: false,
    onCompleted: async () => {
      if (entityTypeEntitiesContext) {
        await entityTypeEntitiesContext.refetch();
      }
    },
  });

  const getRefetchQueries = useCallback((pageEntityId: EntityId) => {
    const ownedById = extractOwnedByIdFromEntityId(pageEntityId);
    return [
      {
        query: getEntitySubgraphQuery,
        variables: getAccountPagesVariables({ ownedById }),
      },

      {
        query: getEntitySubgraphQuery,
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
