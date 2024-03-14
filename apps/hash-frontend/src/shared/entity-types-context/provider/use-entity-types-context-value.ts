import type { VersionedUrl } from "@blockprotocol/type-system";
import type { EntityTypeWithMetadata } from "@local/hash-subgraph";
import { getEntityTypes } from "@local/hash-subgraph/stdlib";
import { useCallback, useMemo, useRef, useState } from "react";

import { useBlockProtocolQueryEntityTypes } from "../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-query-entity-types";
import type { EntityTypesContextValue } from "../shared/context-types";
import {
  getParentIds,
  isSpecialEntityType,
} from "../shared/is-special-entity-type";

export const useEntityTypesContextValue = (): EntityTypesContextValue => {
  const [types, setTypes] = useState<
    Omit<EntityTypesContextValue, "refetch" | "ensureFetched">
  >({
    entityTypes: null,
    isSpecialEntityTypeLookup: null,
    entityTypeParentIds: null,
    loading: true,
    subgraph: null,
  });

  const { queryEntityTypes } = useBlockProtocolQueryEntityTypes();

  const controllerRef = useRef<AbortController | null>(null);

  const fetched = useRef(false);

  const fetch = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    fetched.current = true;

    setTypes((currentTypes) => ({ ...currentTypes, loading: true }));

    const res = await queryEntityTypes({
      data: {
        latestOnly: false,
        includeArchived: true,
      },
    });

    if (controller.signal.aborted) {
      return;
    }

    const subgraph = res.data;
    const entityTypes = subgraph ? getEntityTypes(subgraph) : [];

    const typesByVersion: Record<VersionedUrl, EntityTypeWithMetadata> =
      Object.fromEntries(entityTypes.map((type) => [type.schema.$id, type]));

    const isSpecialEntityTypeLookup = Object.fromEntries(
      entityTypes.map((type) => [
        type.schema.$id,
        isSpecialEntityType(type.schema, typesByVersion),
      ]),
    );

    const entityTypeParentIds = Object.fromEntries(
      entityTypes.map((type) => [
        type.schema.$id,
        getParentIds(type.schema, typesByVersion),
      ]),
    );

    setTypes({
      entityTypes,
      entityTypeParentIds,
      isSpecialEntityTypeLookup,
      subgraph: subgraph ?? null,
      loading: false,
    });
  }, [queryEntityTypes]);

  const ensureFetched = useCallback(() => {
    if (!fetched.current) {
      fetched.current = true;
      void fetch();
    }
  }, [fetch]);

  return useMemo(
    () => ({ ...types, refetch: fetch, ensureFetched }),
    [fetch, types, ensureFetched],
  );
};
