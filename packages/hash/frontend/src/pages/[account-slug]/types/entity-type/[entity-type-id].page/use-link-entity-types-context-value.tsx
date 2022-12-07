import { VersionedUri } from "@blockprotocol/type-system";
import { EntityTypeWithMetadata } from "@hashintel/hash-subgraph";
import { getEntityTypes } from "@hashintel/hash-subgraph/src/stdlib/element/entity-type";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { useBlockProtocolAggregateEntityTypes } from "../../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolAggregateEntityTypes";

export const useLinkEntityTypesContextValue = () => {
  const [loading, setLoading] = useState(true);
  const [links, setLinks] = useState<Record<
    VersionedUri,
    EntityTypeWithMetadata
  > | null>(null);

  const { aggregateEntityTypes } = useBlockProtocolAggregateEntityTypes();

  const router = useRouter();
  const lastFetched = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setLinks(null);
    lastFetched.current = router.asPath;

    void aggregateEntityTypes({ data: {} }).then((res) => {
      if (!cancelled) {
        const subgraph = res.data;
        const entityTypes = subgraph ? getEntityTypes(subgraph) : [];
        const linkEntityTypes = entityTypes.filter(
          (type) => !!type.schema.allOf,
        );

        const record = Object.fromEntries(
          linkEntityTypes.map((link) => [link.schema.$id, link]),
        );
        setLinks(record);
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

  return [loading ? null : links, { loading }] as const;
};
