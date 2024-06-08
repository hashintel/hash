import type { ApolloQueryResult } from "@apollo/client";
import { useQuery } from "@apollo/client";
import type { EntityMetadata } from "@local/hash-graph-types/entity";
import type { OwnedById } from "@local/hash-graph-types/web";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { SimpleProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { deserializeSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { PageProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import type { EntityRootType } from "@local/hash-subgraph";
import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import { useMemo } from "react";

import type {
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
} from "../../graphql/api-types.gen";
import { getEntitySubgraphQuery } from "../../graphql/queries/knowledge/entity.queries";
import { getAccountPagesVariables } from "../../shared/account-pages-variables";
import { useHashInstance } from "./use-hash-instance";

export type SimplePage = SimpleProperties<PageProperties> & {
  metadata: EntityMetadata;
  parentPage?: { metadata: EntityMetadata } | null;
  type: "canvas" | "document";
};

export type AccountPagesInfo = {
  data: SimplePage[];
  lastRootPageIndex: string | null;
  loading: boolean;
  refetch: () => Promise<ApolloQueryResult<GetEntitySubgraphQuery>>;
};

export const useAccountPages = (
  ownedById?: OwnedById,
  includeArchived?: boolean,
): AccountPagesInfo => {
  const { hashInstance } = useHashInstance();

  const { data, loading, refetch } = useQuery<
    GetEntitySubgraphQuery,
    GetEntitySubgraphQueryVariables
  >(getEntitySubgraphQuery, {
    variables: getAccountPagesVariables({
      ownedById,
      includeArchived,
    }),
    skip: !ownedById || !hashInstance?.properties.pagesAreEnabled,
  });

  const pages = useMemo<SimplePage[]>(() => {
    const subgraph = data?.getEntitySubgraph.subgraph;

    if (!subgraph) {
      return [];
    }

    const typedSubgraph =
      mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(subgraph);

    return getRoots(typedSubgraph).map((latestPage) => {
      const pageOutgoingLinks = getOutgoingLinkAndTargetEntities(
        deserializeSubgraph(subgraph),
        latestPage.metadata.recordId.entityId,
      );

      const parentLink = pageOutgoingLinks.find(
        ({ linkEntity }) =>
          linkEntity[0]!.metadata.entityTypeId ===
          systemLinkEntityTypes.hasParent.linkEntityTypeId,
      );

      const parentPage = parentLink?.rightEntity[0] ?? null;

      return {
        ...simplifyProperties(latestPage.properties as PageProperties),
        metadata: latestPage.metadata,
        parentPage: parentPage ? { metadata: parentPage.metadata } : null,
        type:
          latestPage.metadata.entityTypeId ===
          systemEntityTypes.canvas.entityTypeId
            ? "canvas"
            : "document",
      };
    });
  }, [data]);

  const lastRootPageIndex = useMemo(() => {
    const rootPages = pages
      .filter(({ parentPage }) => !parentPage)
      .map(({ fractionalIndex }) => fractionalIndex)
      .sort();

    return rootPages[rootPages.length - 1] ?? null;
  }, [pages]);

  return useMemo(
    () => ({ data: pages, lastRootPageIndex, loading, refetch }),
    [pages, lastRootPageIndex, loading, refetch],
  );
};
