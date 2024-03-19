import type { PropertyTypeRootType } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useBlockProtocolQueryPropertyTypes } from "../../components/hooks/block-protocol-functions/ontology/use-block-protocol-query-property-types";
import type { PropertyTypesContextValues } from "../property-types-context";

export const usePropertyTypesContextValue = (params?: {
  includeArchived?: boolean;
}) => {
  const { includeArchived = false } = params ?? {};

  const [propertyTypes, setPropertyTypes] = useState<
    PropertyTypesContextValues["propertyTypes"] | null
  >(null);
  const { queryPropertyTypes } = useBlockProtocolQueryPropertyTypes();

  const fetch = useCallback(async () => {
    await queryPropertyTypes({
      data: { includeArchived, latestOnly: false },
    }).then(({ data: propertyTypesSubgraph }) => {
      if (propertyTypesSubgraph) {
        setPropertyTypes((existingPropertyTypes) => ({
          ...(existingPropertyTypes ?? {}),
          ...Object.fromEntries(
            getRoots<PropertyTypeRootType>(propertyTypesSubgraph).map(
              (propertyType) => {
                return [propertyType.schema.$id, propertyType];
              },
            ),
          ),
        }));
      }
    });
  }, [queryPropertyTypes, includeArchived]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const result = useMemo(
    () => ({ refetch: fetch, propertyTypes }),
    [fetch, propertyTypes],
  );

  return result;
};
