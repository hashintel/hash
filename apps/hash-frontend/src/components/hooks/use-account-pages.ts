import { ApolloQueryResult, useQuery } from "@apollo/client";
import { typedValues } from "@local/advanced-types/typed-entries";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-graphql-shared/graphql/types";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import {
  SimpleProperties,
  simplifyProperties,
} from "@local/hash-isomorphic-utils/simplify-properties";
import { PageProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import {
  Entity,
  EntityMetadata,
  EntityRootType,
  OwnedById,
} from "@local/hash-subgraph";
import { getOutgoingLinkAndTargetEntities } from "@local/hash-subgraph/stdlib";
import { useMemo } from "react";

import {
  StructuralQueryEntitiesQuery,
  StructuralQueryEntitiesQueryVariables,
} from "../../graphql/api-types.gen";
import { structuralQueryEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import { getAccountPagesVariables } from "../../shared/account-pages-variables";
import { useHashInstance } from "./use-hash-instance";

export type SimplePage = SimpleProperties<PageProperties> & {
  metadata: EntityMetadata;
  parentPage?: { metadata: EntityMetadata } | null;
};

export type AccountPagesInfo = {
  data: SimplePage[];
  lastRootPageIndex: string | null;
  loading: boolean;
  refetch: () => Promise<ApolloQueryResult<StructuralQueryEntitiesQuery>>;
};

export const useAccountPages = (
  ownedById?: OwnedById,
  includeArchived?: boolean,
): AccountPagesInfo => {
  const { hashInstance } = useHashInstance();

  const { data, loading, refetch } = useQuery<
    StructuralQueryEntitiesQuery,
    StructuralQueryEntitiesQueryVariables
  >(structuralQueryEntitiesQuery, {
    variables: getAccountPagesVariables({
      ownedById,
      includeArchived,
    }),
    skip: !ownedById || !hashInstance?.properties.pagesAreEnabled,
  });

  const pages = useMemo<SimplePage[]>(() => {
    const subgraph = data?.structuralQueryEntities.subgraph;

    if (!subgraph) {
      return [];
    }

    const typedSubgraph =
      mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(subgraph);

    return typedSubgraph.roots.map((root) => {
      const pageEntityRevisions = typedSubgraph.vertices[root.baseId];

      if (!pageEntityRevisions) {
        throw new Error(`Could not find page entity with id ${root.baseId}`);
      }

      const latestPage = typedValues(pageEntityRevisions)[0]!
        .inner as Entity<PageProperties>;

      const pageOutgoingLinks = getOutgoingLinkAndTargetEntities(
        subgraph,
        latestPage.metadata.recordId.entityId,
      );

      const parentLink = pageOutgoingLinks.find(
        ({ linkEntity }) =>
          linkEntity[0]!.metadata.entityTypeId ===
          types.linkEntityType.parent.linkEntityTypeId,
      );

      const parentPage = parentLink?.rightEntity[0] ?? null;

      return {
        ...simplifyProperties(latestPage.properties),
        metadata: latestPage.metadata,
        parentPage: parentPage ? { metadata: parentPage.metadata } : null,
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
