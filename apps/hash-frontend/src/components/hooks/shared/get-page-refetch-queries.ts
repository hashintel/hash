import { getPageQuery } from "@local/hash-graphql-shared/queries/page.queries";
import { EntityId, extractOwnedByIdFromEntityId } from "@local/hash-subgraph";
import { useCallback } from "react";

import { structuralQueryEntitiesQuery } from "../../../graphql/queries/knowledge/entity.queries";
import { getAccountPagesVariables } from "../../../shared/account-pages-variables";

/**
 * Some aspects of a page, e.g. the icon and title, are shown in multiple places:
 * 1. The header on the page's own page
 * 2. The page list in the sidebar in which the page may appear
 * 3. Breadcrumbs on a page, in which the page may appear
 *
 * Because these use different queries to populate the data for, we need to refetch multiple queries
 */
export const useGetPageRefetchQueries = () =>
  useCallback(
    (pageEntityId: EntityId) => [
      {
        query: structuralQueryEntitiesQuery,
        variables: getAccountPagesVariables({
          ownedById: extractOwnedByIdFromEntityId(pageEntityId),
          // Breadcrumbs use the archived query (since they may be archived)
          includeArchived: true,
        }),
      },
      {
        query: structuralQueryEntitiesQuery,
        variables: getAccountPagesVariables({
          // The page sidebar does not include archived pages
          ownedById: extractOwnedByIdFromEntityId(pageEntityId),
        }),
      },
      {
        // @todo this will need updating when https://github.com/hashintel/hash/pull/3525 is merged
        query: getPageQuery,
        variables: {
          // The query for the page's own page
          entityId: pageEntityId,
        },
      },
    ],
    [],
  );
