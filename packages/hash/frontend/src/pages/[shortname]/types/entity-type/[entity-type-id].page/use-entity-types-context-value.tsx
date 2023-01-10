import { linkEntityTypeUri } from "@hashintel/hash-subgraph";
import { getEntityTypes } from "@hashintel/hash-subgraph/src/stdlib/element/entity-type";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useBlockProtocolAggregateEntityTypes } from "../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-aggregate-entity-types";
import {
  EntityTypesContextValue,
  EntityTypesSet,
} from "./shared/entity-types-context";

export const useEntityTypesContextValue = (): EntityTypesContextValue => {
  const [types, setTypes] = useState<Omit<EntityTypesContextValue, "refetch">>({
    entityTypes: null,
    linkTypes: null,
  });

  const { aggregateEntityTypes } = useBlockProtocolAggregateEntityTypes();

  const controllerRef = useRef<AbortController | null>(null);

  const fetch = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

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
    });
  }, [aggregateEntityTypes]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  return useMemo(() => ({ ...types, refetch: fetch }), [fetch, types]);
};
