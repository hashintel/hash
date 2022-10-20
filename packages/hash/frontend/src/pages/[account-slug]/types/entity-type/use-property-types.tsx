import { PropertyType, VersionedUri } from "@blockprotocol/type-system-web";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useBlockProtocolAggregatePropertyTypes } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolAggregatePropertyTypes";
import { getPersistedPropertyType } from "../../../../lib/subgraph";
import { useAdvancedInitTypeSystem } from "../../../../lib/use-init-type-system";
import { mustBeVersionedUri } from "./util";

type PropertyTypesContextValues = {
  types: Record<VersionedUri, PropertyType>;
  refetch: () => Promise<void>;
};

export const usePropertyTypesContextValue = () => {
  const [typeSystemLoading] = useAdvancedInitTypeSystem();
  const [propertyTypes, setPropertyTypes] = useState<
    PropertyTypesContextValues["types"] | null
  >(null);
  const { aggregatePropertyTypes } = useBlockProtocolAggregatePropertyTypes();

  const fetch = useCallback(async () => {
    if (typeSystemLoading) {
      return;
    }
    await aggregatePropertyTypes({ data: {} }).then(({ data: subgraph }) => {
      // @todo error handling
      if (subgraph) {
        setPropertyTypes(
          Object.fromEntries(
            subgraph.roots.map((propertyTypeId) => {
              const propertyType = getPersistedPropertyType(
                subgraph,
                propertyTypeId,
              );

              if (!propertyType) {
                throw new Error(
                  "property type was missing from the subgraph vertices list",
                );
              }

              return [mustBeVersionedUri(propertyTypeId), propertyType.inner];
            }),
          ),
        );
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
