import { PropertyType, VersionedUri } from "@blockprotocol/type-system-web";
import { createContext, useContext, useEffect, useState } from "react";
import { useBlockProtocolAggregatePropertyTypes } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolAggregatePropertyTypes";
import { mustBeVersionedUri } from "./util";
import {
  getPersistedPropertyType,
  isPropertyTypeVertex,
  roots,
} from "../../../../lib/subgraph";

type PropertyTypesContextValues = Record<VersionedUri, PropertyType>;

export const useRemotePropertyTypes = () => {
  const [propertyTypes, setPropertyTypes] =
    useState<PropertyTypesContextValues | null>(null);
  const { aggregatePropertyTypes } = useBlockProtocolAggregatePropertyTypes();

  useEffect(() => {
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
  }, [aggregatePropertyTypes]);

  return propertyTypes;
};

export const PropertyTypesContext =
  createContext<null | PropertyTypesContextValues>(null);

export const usePropertyTypes = () => {
  const types = useContext(PropertyTypesContext);

  if (!types) {
    throw new Error("Property types not loaded yet");
  }

  return types;
};
