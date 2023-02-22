import { getEntityTypes } from "@local/hash-subgraph/stdlib";
import { useCallback, useMemo, useRef, useState } from "react";

import { useBlockProtocolAggregateEntityTypes } from "../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-aggregate-entity-types";
import { EntityTypesContextValue } from "../shared/context-types";

export const useEntityTypesContextValue = (): EntityTypesContextValue => {
  const [types, setTypes] = useState<
    Omit<EntityTypesContextValue, "refetch" | "ensureFetched">
  >({
    entityTypes: null,
    loading: true,
    subgraph: null,
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

    setTypes({
      entityTypes,
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
