import { PropertyType, VersionedUri } from "@blockprotocol/type-system";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import { useBlockProtocolAggregatePropertyTypes } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolAggregatePropertyTypes";
import { useInitTypeSystem } from "../../../../lib/use-init-type-system";

type PropertyTypesContextValues = {
  types: Record<VersionedUri, PropertyType> | null;
  refetch: () => Promise<void>;
};

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

export const PropertyTypesContext =
  createContext<null | PropertyTypesContextValues>(null);

export const usePropertyTypes = () => {
  return useContext(PropertyTypesContext)?.types;
};

export const useRefetchPropertyTypes = () => {
  return useContext(PropertyTypesContext)?.refetch;
};
