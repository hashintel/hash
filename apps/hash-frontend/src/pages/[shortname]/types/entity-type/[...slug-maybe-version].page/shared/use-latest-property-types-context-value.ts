import { PropertyTypeRootType } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useBlockProtocolQueryPropertyTypes } from "../../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-query-property-types";
import { LatestPropertyTypesContextValues } from "./latest-property-types-context";

export const useLatestPropertyTypesContextValue = () => {
  const [propertyTypes, setPropertyTypes] = useState<
    LatestPropertyTypesContextValues["propertyTypes"] | null
  >(null);
  const { queryPropertyTypes } = useBlockProtocolQueryPropertyTypes();

  const fetch = useCallback(async () => {
    await queryPropertyTypes({ data: {} }).then(
      ({ data: propertyTypesSubgraph }) => {
        if (propertyTypesSubgraph) {
          setPropertyTypes((existingPropertyTypes) => ({
            ...(existingPropertyTypes ?? {}),
            ...Object.fromEntries(
              getRoots<PropertyTypeRootType>(propertyTypesSubgraph).map(
                (propertyType) => {
                  return [propertyType.schema.$id, propertyType.schema];
                },
              ),
            ),
          }));
        }
      },
    );
  }, [queryPropertyTypes]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const result = useMemo(
    () => ({ refetch: fetch, propertyTypes }),
    [fetch, propertyTypes],
  );

  return result;
};
