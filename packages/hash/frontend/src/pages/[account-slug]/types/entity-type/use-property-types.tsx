import { PropertyType } from "@blockprotocol/type-system-web";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { useBlockProtocolAggregatePropertyTypes } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolAggregatePropertyTypes";
import { parseUriForOntologyChip } from "./ontology-chip";

export type PropertyTypeOption = {
  path: string;
  domain: string;
  icon: ReactNode;
  description: string;
  title: string;
  expectedValues: string[];
  $id: string;
};

const dataTypeNames = {
  "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1": "Text",
  "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1":
    "Number",
  "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1":
    "Boolean",
  "https://blockprotocol.org/@blockprotocol/types/data-type/null/v/1": "Null",
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

export const usePropertyTypes = () => {
  return useContext(PropertyTypesContext);
};

/**
 * @deprecated
 */
export const mapPropertyType = (type: PropertyType): PropertyTypeOption => {
  const expectedValues = type.oneOf.reduce<string[]>((types, val) => {
    if ("$ref" in val && dataTypeNames[val.$ref]) {
      types.push(dataTypeNames[val.$ref]!);
    }

    return types;
  }, []);

  return {
    ...parseUriForOntologyChip(type.$id),
    title: type.title,
    expectedValues,
    description: type.description ?? "",
    $id: type.$id,
  };
};

/**
 * @deprecated
 */
export const useMappedPropertyTypes = () => {
  const propertyTypes = usePropertyTypes();

  return (
    propertyTypes
      ?.map((type) => mapPropertyType(type))
      .filter((type) => !!type.expectedValues.length) ?? []
  );
};
