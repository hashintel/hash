import { PropertyType } from "@blockprotocol/type-system-web";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { useBlockProtocolAggregatePropertyTypes } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolAggregatePropertyTypes";

export type PropertyTypeOption = {
  path: string;
  domain: string;
  icon: ReactNode;
  description: string;
  title: string;
  expectedValues: string[];
  $id: string;
};

export const dataTypeNames = {
  "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1": "Text",
  "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1":
    "Number",
  "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1":
    "Boolean",
  "https://blockprotocol.org/@blockprotocol/types/data-type/null/v/1": "Null",
  "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1":
    "JSON Object",
} as Record<string, string>;

export const useRemotePropertyTypes = () => {
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[] | null>(
    null,
  );
  const { aggregatePropertyTypes } = useBlockProtocolAggregatePropertyTypes();

  useEffect(() => {
    void aggregatePropertyTypes({ data: {} }).then((data) => {
      // @todo error handling
      setPropertyTypes(
        data.data?.results.map((result) => result.propertyType) ?? null,
      );
    });
  }, [aggregatePropertyTypes]);

  return propertyTypes;
};

export const PropertyTypesContext = createContext<null | PropertyType[]>(null);

export const usePropertyTypes = () => useContext(PropertyTypesContext);
