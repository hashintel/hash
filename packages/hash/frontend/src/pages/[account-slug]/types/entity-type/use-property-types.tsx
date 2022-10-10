import { PropertyType } from "@blockprotocol/type-system-web";
import { createContext, useContext, useEffect, useState } from "react";
import { useBlockProtocolAggregatePropertyTypes } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolAggregatePropertyTypes";

export const useRemotePropertyTypes = () => {
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[] | null>(
    null,
  );
  const { aggregatePropertyTypes } = useBlockProtocolAggregatePropertyTypes();

  useEffect(() => {
    void aggregatePropertyTypes({ data: {} }).then((data) => {
      // @todo error handling
      setPropertyTypes(
        data.data?.results.map((result) => result.propertyType) ?? [],
      );
    });
  }, [aggregatePropertyTypes]);

  return propertyTypes;
};

export const PropertyTypesContext = createContext<null | PropertyType[]>(null);

export const usePropertyTypes = () => useContext(PropertyTypesContext);
