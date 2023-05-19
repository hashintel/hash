import { useQuery } from "@apollo/client";
import { VersionedUrl } from "@blockprotocol/type-system";
import { Entity, EntityRootType, Subgraph } from "@local/hash-subgraph";
import { getEntityTypeById, getRoots } from "@local/hash-subgraph/stdlib";
import { useMemo } from "react";

import {
  QueryEntitiesQuery,
  QueryEntitiesQueryVariables,
} from "../../graphql/api-types.gen";
import { queryEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import { generateEntityLabel } from "../../lib/entities";

export const useAllEntitiesExcept = (
  exceptedEntityTypeIds: VersionedUrl[],
): {
  loading: boolean;
  entities?: { entity: Entity; label: string; entityTypeTitle: string }[];
} => {
  const { data, loading } = useQuery<
    QueryEntitiesQuery,
    QueryEntitiesQueryVariables
  >(queryEntitiesQuery, {
    variables: {
      operation: {
        multiFilter: {
          filters: exceptedEntityTypeIds.map((entityTypeId) => ({
            field: ["metadata", "entityTypeId"],
            operator: "DOES_NOT_EQUAL",
            value: entityTypeId,
          })),
          operator: "AND",
        },
      },
      constrainsValuesOn: { outgoing: 0 },
      constrainsPropertiesOn: { outgoing: 1 },
      constrainsLinksOn: { outgoing: 0 },
      constrainsLinkDestinationsOn: { outgoing: 0 },
      isOfType: { outgoing: 1 },
      hasLeftEntity: { incoming: 0, outgoing: 0 },
      hasRightEntity: { incoming: 0, outgoing: 0 },
    },
    /** @todo reconsider caching. This is done for testing/demo purposes. */
    fetchPolicy: "no-cache",
  });

  const { queryEntities: subgraph } = data ?? {};

  const entities = useMemo(() => {
    if (!subgraph) {
      return undefined;
    }

    const roots = getRoots(subgraph as Subgraph<EntityRootType>);

    return roots.map((root) => ({
      entity: root,
      label: generateEntityLabel(subgraph as Subgraph<EntityRootType>, root),
      entityTypeTitle:
        getEntityTypeById(subgraph, root.metadata.entityTypeId)?.schema.title ??
        "Unknown",
    }));
  }, [subgraph]);

  return {
    loading,
    entities,
  };
};
