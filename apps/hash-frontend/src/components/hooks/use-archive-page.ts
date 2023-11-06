import { useMutation } from "@apollo/client";
import { getPageQuery } from "@local/hash-graphql-shared/queries/page.queries";
import { EntityId, extractOwnedByIdFromEntityId } from "@local/hash-subgraph";
import { useCallback, useContext } from "react";

import {
  UpdatePageMutation,
  UpdatePageMutationVariables,
} from "../../graphql/api-types.gen";
import { structuralQueryEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import { updatePage } from "../../graphql/queries/page.queries";
import { getAccountPagesVariables } from "../../shared/account-pages-variables";
import { EntityTypeEntitiesContext } from "../../shared/entity-type-entities-context";

export const useArchivePage = () => {
  const entityTypeEntitiesContext = useContext(EntityTypeEntitiesContext);

  const [updatePageFn, { loading }] = useMutation<
    UpdatePageMutation,
    UpdatePageMutationVariables
  >(updatePage, {
    awaitRefetchQueries: true,
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
        query: getPageQuery,
        variables: { entityId: pageEntityId },
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
