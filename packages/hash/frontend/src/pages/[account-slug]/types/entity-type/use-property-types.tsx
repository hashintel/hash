import {
  extractBaseUri,
  validateVersionedUri,
} from "@blockprotocol/type-system-web";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { useBlockProtocolAggregatePropertyTypes } from "../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolAggregatePropertyTypes";
import { HashOntologyIcon } from "./hash-ontology-icon";

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
  const [propertyTypes, setPropertyTypes] = useState<
    PropertyTypeOption[] | null
  >(null);
  const { aggregatePropertyTypes } = useBlockProtocolAggregatePropertyTypes();

  useEffect(() => {
    void aggregatePropertyTypes({ data: {} }).then((data) => {
      // @todo error handling
      setPropertyTypes(
        data.data?.results
          .map((result) => result.propertyType)
          .map((type): PropertyTypeOption => {
            const validated = validateVersionedUri(type.$id);
            const parsed =
              validated.type === "Ok" ? extractBaseUri(validated.inner) : "";
            const url = new URL(parsed);

            const domain = url.host === "localhost:3000" ? "hash.ai" : url.host;

            const pathname = url.pathname.slice(1);
            const isHash = domain === "hash.ai";
            const parts = pathname.split("/");
            const path = isHash ? `${parts[0]}/${parts.at(-2)}` : pathname;

            const expectedValues = type.oneOf.reduce<string[]>((types, val) => {
              if ("$ref" in val && dataTypeNames[val.$ref]) {
                types.push(dataTypeNames[val.$ref]!);
              }

              return types;
            }, []);

            return {
              title: type.title,
              icon: isHash ? <HashOntologyIcon /> : null,
              domain,
              path,
              expectedValues,
              description: type.description ?? "",
              $id: type.$id,
            };
          })
          .filter((type) => !!type.expectedValues.length) ?? [],
      );
    });
  }, [aggregatePropertyTypes]);

  return propertyTypes;
};

export const PropertyTypesContext = createContext<null | PropertyTypeOption[]>(
  null,
);

export const usePropertyTypes = () => useContext(PropertyTypesContext);
