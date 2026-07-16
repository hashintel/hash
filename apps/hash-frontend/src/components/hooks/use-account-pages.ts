import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@blockprotocol/graph/stdlib";
import { deserializeQueryEntitySubgraphResponse } from "@local/hash-graph-sdk/entity";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";

import { queryEntitySubgraphQuery } from "../../graphql/queries/knowledge/entity.queries";
import { getAccountPagesVariables } from "../../shared/account-pages-variables";
import { useHashInstance } from "./use-hash-instance";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../graphql/api-types.gen";
import type { ApolloQueryResult } from "@apollo/client";
import type { EntityMetadata, WebId } from "@blockprotocol/type-system";
import type { SimpleProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { PageProperties } from "@local/hash-isomorphic-utils/system-types/shared";

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
    const response = data?.queryEntitySubgraph;

    if (!response) {
      return [];
    }

    const subgraph = deserializeQueryEntitySubgraphResponse(response).subgraph;

    return getRoots(subgraph).map((latestPage) => {
      const pageOutgoingLinks = getOutgoingLinkAndTargetEntities(
        subgraph,
        latestPage.metadata.recordId.entityId,
      );

      const [parentLink] = pageOutgoingLinks.flatMap(
        ({ linkEntity, rightEntity }) => {
          const hasParentLinkEntity = linkEntity[0];

          return hasParentLinkEntity?.metadata.entityTypeIds.includes(
            systemLinkEntityTypes.hasParent.linkEntityTypeId,
          )
            ? [{ hasParentLinkEntity, rightEntity }]
            : [];
        },
      );

      /**
       * A `has-parent` link can be present in the subgraph while its target
       * page is legitimately absent (`rightEntity` missing or empty): the
       * parent page may be archived (its revisions no longer overlap the
       * queried interval) or not visible to the requester. Treat such pages
       * as parentless rather than erroring.
       */
      const parentPage = parentLink?.rightEntity?.[0] ?? null;

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
