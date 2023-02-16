import { Subgraph } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useBlockProtocolAggregatePropertyTypes } from "../../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-aggregate-property-types";
import { LatestPropertyTypesContextValues } from "./latest-property-types-context";

export const useLatestPropertyTypesContextValue = () => {
  const [subgraph, setSubgraph] = useState<Subgraph | null>(null);
  const [propertyTypes, setPropertyTypes] = useState<
    LatestPropertyTypesContextValues["types"] | null
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
