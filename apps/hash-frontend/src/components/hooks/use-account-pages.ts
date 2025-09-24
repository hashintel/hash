import type { ApolloQueryResult } from "@apollo/client";
import { useQuery } from "@apollo/client";
import type { EntityRootType } from "@blockprotocol/graph";
import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@blockprotocol/graph/stdlib";
import type { EntityMetadata, WebId } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { deserializeSubgraph } from "@local/hash-graph-sdk/subgraph";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { SimpleProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { PageProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { useMemo } from "react";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../graphql/api-types.gen";
import { queryEntitySubgraphQuery } from "../../graphql/queries/knowledge/entity.queries";
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
  refetch: () => Promise<ApolloQueryResult<QueryEntitySubgraphQuery>>;
};

export const useAccountPages = (
  webId?: WebId,
  includeArchived?: boolean,
): AccountPagesInfo => {
  const { hashInstance } = useHashInstance();

  const { data, loading, refetch } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    variables: getAccountPagesVariables({
      webId,
      includeArchived,
    }),
    skip: !webId || !hashInstance?.properties.pagesAreEnabled,
  });

  const pages = useMemo<SimplePage[]>(() => {
    const subgraph = data?.queryEntitySubgraph.subgraph;

    if (!subgraph) {
      return [];
    }

    const typedSubgraph =
      mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType<HashEntity>>(
        subgraph,
      );

    return getRoots(typedSubgraph).map((latestPage) => {
      const pageOutgoingLinks = getOutgoingLinkAndTargetEntities(
        deserializeSubgraph(subgraph),
        latestPage.metadata.recordId.entityId,
      );

      const parentLink = pageOutgoingLinks.find(({ linkEntity }) =>
        linkEntity[0]!.metadata.entityTypeIds.includes(
          systemLinkEntityTypes.hasParent.linkEntityTypeId,
        ),
      );

      const parentPage = parentLink?.rightEntity[0] ?? null;

      return {
        ...simplifyProperties(latestPage.properties as PageProperties),
        metadata: latestPage.metadata,
        parentPage: parentPage ? { metadata: parentPage.metadata } : null,
        type: latestPage.metadata.entityTypeIds.includes(
          systemEntityTypes.canvas.entityTypeId,
        )
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
