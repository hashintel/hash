import { Subgraph } from "@hashintel/hash-subgraph";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useBlockProtocolAggregatePropertyTypes } from "../../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-aggregate-property-types";
import { PropertyTypesContextValues } from "./property-types-context";

export const usePropertyTypesContextValue = () => {
  const [subgraph, setSubgraph] = useState<Subgraph | null>(null);
  const [propertyTypes, setPropertyTypes] = useState<
    PropertyTypesContextValues["types"] | null
  >(null);
  const { aggregatePropertyTypes } = useBlockProtocolAggregatePropertyTypes();

  const fetch = useCallback(async () => {
    await aggregatePropertyTypes({ data: {} }).then(
      ({ data: propertyTypesSubgraph }) => {
        if (propertyTypesSubgraph) {
          setSubgraph(propertyTypesSubgraph);
          setPropertyTypes((existingPropertyTypes) => ({
            ...existingPropertyTypes,
            ...Object.fromEntries(
              getRoots(propertyTypesSubgraph).map((propertyType) => {
                return [propertyType.schema.$id, propertyType.schema];
              }),
            ),
          }));
        }
      },
    );
  }, [aggregatePropertyTypes]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const result = useMemo(
    () => ({ refetch: fetch, types: propertyTypes, subgraph }),
    [fetch, propertyTypes, subgraph],
  );

  return result;
};
