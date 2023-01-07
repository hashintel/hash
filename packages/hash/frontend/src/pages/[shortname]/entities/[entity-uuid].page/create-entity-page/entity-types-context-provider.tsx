import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import { PropsWithChildren, useEffect, useMemo, useState } from "react";

import { useBlockProtocolAggregateEntityTypes } from "../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-aggregate-entity-types";
import {
  EntityTypesContext,
  EntityTypesContextValues,
} from "./shared/entity-types-context";

export const EntityTypesContextProvider = ({ children }: PropsWithChildren) => {
  const [entityTypes, setEntityTypes] = useState<
    EntityTypesContextValues["types"] | null
  >(null);
  const { aggregateEntityTypes } = useBlockProtocolAggregateEntityTypes();

  useEffect(() => {
    const fetch = async () => {
      await aggregateEntityTypes({ data: {} }).then(({ data: subgraph }) => {
        if (subgraph) {
          setEntityTypes(
            Object.fromEntries(
              getRoots(subgraph).map((entityType) => {
                return [entityType.schema.$id, entityType.schema];
              }),
            ),
          );
        }
      });
    };

    void fetch();
  }, [aggregateEntityTypes]);

  const state = useMemo(() => ({ types: entityTypes }), [entityTypes]);

  return (
    <EntityTypesContext.Provider value={state}>
      {children}
    </EntityTypesContext.Provider>
  );
};
