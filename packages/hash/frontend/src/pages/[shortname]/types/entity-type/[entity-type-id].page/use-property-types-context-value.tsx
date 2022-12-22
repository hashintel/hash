import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useBlockProtocolAggregatePropertyTypes } from "../../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolAggregatePropertyTypes";
import { useInitTypeSystem } from "../../../../../lib/use-init-type-system";
import { PropertyTypesContextValues } from "./shared/property-types-context";

export const usePropertyTypesContextValue = () => {
  const typeSystemLoading = useInitTypeSystem();
  const [propertyTypes, setPropertyTypes] = useState<
    PropertyTypesContextValues["types"] | null
  >(null);
  const { aggregatePropertyTypes } = useBlockProtocolAggregatePropertyTypes();

  const fetch = useCallback(async () => {
    if (typeSystemLoading) {
      return;
    }
    await aggregatePropertyTypes({ data: {} }).then(({ data: subgraph }) => {
      if (subgraph) {
        setPropertyTypes((existingPropertyTypes) => ({
          ...existingPropertyTypes,
          ...Object.fromEntries(
            getRoots(subgraph).map((propertyType) => {
              return [propertyType.schema.$id, propertyType.schema];
            }),
          ),
        }));
      }
    });
  }, [aggregatePropertyTypes, typeSystemLoading]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const result = useMemo(
    () => ({ refetch: fetch, types: propertyTypes }),
    [fetch, propertyTypes],
  );

  return result;
};
