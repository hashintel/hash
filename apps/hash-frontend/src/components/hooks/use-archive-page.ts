import { useMutation } from "@apollo/client";
import { getEntityQuery } from "@local/hash-isomorphic-utils/graphql/queries/entity.queries";
import {
  EntityId,
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";
import { useCallback, useContext } from "react";

import {
  UpdatePageMutation,
  UpdatePageMutationVariables,
} from "../../graphql/api-types.gen";
import { structuralQueryEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
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
        query: structuralQueryEntitiesQuery,
        variables: getAccountPagesVariables({ ownedById }),
      },

      {
        query: structuralQueryEntitiesQuery,
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
