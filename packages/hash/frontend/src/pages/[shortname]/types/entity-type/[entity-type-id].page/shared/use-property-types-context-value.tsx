import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useBlockProtocolAggregatePropertyTypes } from "../../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-aggregate-property-types";
import { PropertyTypesContextValues } from "./property-types-context";

export const usePropertyTypesContextValue = () => {
  const [propertyTypes, setPropertyTypes] = useState<
    PropertyTypesContextValues["types"] | null
  >(null);
  const { aggregatePropertyTypes } = useBlockProtocolAggregatePropertyTypes();

  const fetch = useCallback(async () => {
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
  }, [aggregatePropertyTypes]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const result = useMemo(
    () => ({ refetch: fetch, types: propertyTypes }),
    [fetch, propertyTypes],
  );

  return result;
};
