import { linkEntityTypeUri } from "@local/hash-subgraph";
import { getEntityTypes } from "@local/hash-subgraph/src/stdlib/element/entity-type";
import { useCallback, useMemo, useRef, useState } from "react";

import { useBlockProtocolAggregateEntityTypes } from "../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-aggregate-entity-types";
import {
  EntityTypesContextValue,
  EntityTypesSet,
} from "../shared/context-types";

export const useEntityTypesContextValue = (): EntityTypesContextValue => {
  const [types, setTypes] = useState<
    Omit<EntityTypesContextValue, "refetch" | "ensureFetched">
  >({
    entityTypes: null,
    linkTypes: null,
    subgraph: null,
    loading: true,
  });

  const { aggregateEntityTypes } = useBlockProtocolAggregateEntityTypes();

  const controllerRef = useRef<AbortController | null>(null);

  const fetched = useRef(false);

  const fetch = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    fetched.current = true;

    setTypes((currentTypes) => ({ ...currentTypes, loading: true }));

    const res = await aggregateEntityTypes({ data: {} });

    if (controller.signal.aborted) {
      return;
    }

    const subgraph = res.data;
    const entityTypes = subgraph ? getEntityTypes(subgraph) : [];

    const linkEntityTypesRecord: EntityTypesSet = {};
    const nonLinkEntityTypesRecord: EntityTypesSet = {};

    for (const entityType of entityTypes) {
      const target =
        entityType.schema.allOf?.length === 1 &&
        entityType.schema.allOf[0]?.$ref === linkEntityTypeUri
          ? linkEntityTypesRecord
          : nonLinkEntityTypesRecord;

      target[entityType.schema.$id] = entityType;
    }
    setTypes({
      entityTypes: nonLinkEntityTypesRecord,
      linkTypes: linkEntityTypesRecord,
      subgraph: subgraph ?? null,
      loading: false,
    });
  }, [aggregateEntityTypes]);

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
