import { getEntityTypes } from "@hashintel/hash-subgraph/src/stdlib/element/entity-type";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { useBlockProtocolAggregateEntityTypes } from "../../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolAggregateEntityTypes";
import {
  EntityTypesContextValue,
  EntityTypesSet,
} from "./shared/entity-types-context";

export const useEntityTypesContextValue = ():
  | { loading: true; data: EntityTypesContextValue | null }
  | { loading: false; data: EntityTypesContextValue } => {
  const [loading, setLoading] = useState(true);
  const [types, setTypes] = useState<EntityTypesContextValue | null>(null);

  const { aggregateEntityTypes } = useBlockProtocolAggregateEntityTypes();

  const router = useRouter();
  const lastFetched = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setTypes(null);
    lastFetched.current = router.asPath;

    void aggregateEntityTypes({ data: {} }).then((res) => {
      if (!cancelled) {
        const subgraph = res.data;
        const entityTypes = subgraph ? getEntityTypes(subgraph) : [];

        const linkEntityTypesRecord: EntityTypesSet = {};
        const nonLinkEntityTypesRecord: EntityTypesSet = {};

        for (const entityType of entityTypes) {
          const target =
            entityType.schema.allOf?.length === 1 &&
            // Don't hardcode
            entityType.schema.allOf[0]?.$ref ===
              "https://blockprotocol.org/@blockprotocol/types/entity-type/link/v/1"
              ? linkEntityTypesRecord
              : nonLinkEntityTypesRecord;

          target[entityType.schema.$id] = entityType;
        }
        setTypes({
          entityTypes: nonLinkEntityTypesRecord,
          linkTypes: linkEntityTypesRecord,
        });
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      setLoading(false);
    };
  }, [
    aggregateEntityTypes,
    // Hack to force a refetch when changing page
    // @todo decide on refetch strategy for blocks
    router.asPath,
  ]);

  return loading || !types
    ? { loading: true, data: types }
    : { loading: false, data: types };
};
