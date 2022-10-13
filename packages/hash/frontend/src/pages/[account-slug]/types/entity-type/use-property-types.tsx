import { PropertyType, VersionedUri } from "@blockprotocol/type-system-web";
import { createContext, useContext, useEffect, useState } from "react";
import { useBlockProtocolAggregatePropertyTypes } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolAggregatePropertyTypes";
import { mustBeVersionedUri } from "./util";

type PropertyTypesContextValues = Record<VersionedUri, PropertyType>;

export const useRemotePropertyTypes = () => {
  const [propertyTypes, setPropertyTypes] =
    useState<PropertyTypesContextValues | null>(null);
  const { aggregatePropertyTypes } = useBlockProtocolAggregatePropertyTypes();

  useEffect(() => {
    void aggregatePropertyTypes({ data: {} }).then((data) => {
      // @todo error handling
      if (data.data) {
        setPropertyTypes(
          Object.fromEntries(
            data.data.results.map(
              (result) =>
                [
                  mustBeVersionedUri(result.propertyTypeId),
                  result.propertyType,
                ] as const,
            ),
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
