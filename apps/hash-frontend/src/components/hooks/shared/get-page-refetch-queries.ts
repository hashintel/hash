import { useCallback } from "react";
import type { EntityId } from "@local/hash-graph-types/entity";
import {
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";

import { getEntitySubgraphQuery } from "../../../graphql/queries/knowledge/entity.queries";
import { getBlockCollectionContentsStructuralQueryVariables } from "../../../pages/shared/block-collection-contents";
import { getAccountPagesVariables } from "../../../shared/account-pages-variables";

/**
 * Some aspects of a page, e.g. The icon and title, are shown in multiple places:
 * 1. The header on the page's own page
 * 2. The page list in the sidebar in which the page may appear
 * 3. Breadcrumbs on a page, in which the page may appear.
 *
 * Because these use different queries to populate the data for, we need to refetch multiple queries.
 */
export const useGetPageRefetchQueries = () =>
  useCallback(
    (pageEntityId: EntityId) => [
      {
        query: getEntitySubgraphQuery,
        variables: getAccountPagesVariables({
          ownedById: extractOwnedByIdFromEntityId(pageEntityId),
          // Breadcrumbs use the archived query (since they may be archived)
          includeArchived: true,
        }),
      },
      {
        query: getEntitySubgraphQuery,
        variables: getAccountPagesVariables({
          // The page sidebar does not include archived pages
          ownedById: extractOwnedByIdFromEntityId(pageEntityId),
        }),
      },
      {
        query: getEntitySubgraphQuery,
        variables: getBlockCollectionContentsStructuralQueryVariables(
          extractEntityUuidFromEntityId(pageEntityId),
        ),
      },
    ],
    [],
  );
