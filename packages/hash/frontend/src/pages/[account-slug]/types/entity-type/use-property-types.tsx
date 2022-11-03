import { PropertyType, VersionedUri } from "@blockprotocol/type-system-web";
import { createContext, useContext, useEffect, useState } from "react";
import { useBlockProtocolAggregatePropertyTypes } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolAggregatePropertyTypes";
import { mustBeVersionedUri } from "./util";
import { getPersistedPropertyType } from "../../../../lib/subgraph";
import { useAdvancedInitTypeSystem } from "../../../../lib/use-init-type-system";

type PropertyTypesContextValues = Record<VersionedUri, PropertyType>;

export const useRemotePropertyTypes = () => {
  const [typeSystemLoading, _] = useAdvancedInitTypeSystem();

  const [propertyTypes, setPropertyTypes] =
    useState<PropertyTypesContextValues | null>(null);
  const { aggregatePropertyTypes } = useBlockProtocolAggregatePropertyTypes();

  useEffect(() => {
    if (typeSystemLoading) {
      return;
    }
    void aggregatePropertyTypes({ data: {} }).then(({ data: subgraph }) => {
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

  return propertyTypes;
};

export const PropertyTypesContext =
  createContext<null | PropertyTypesContextValues>(null);

export const usePropertyTypes = () => {
  return useContext(PropertyTypesContext);
};
