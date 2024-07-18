import type { GraphEmbedderMessageCallbacks } from "@blockprotocol/graph";
import type { EntityType, PropertyType } from "@blockprotocol/type-system/slim";
import { createContext, useContext } from "react";

export type TitleValidationFunction = (proposal: {
  kind: "entity-type" | "property-type";
  title: string;
}) => Promise<{
  allowed: boolean;
  message: string;
}>;

export type canEditResourceFunction = (proposal: {
  kind: "link-type" | "property-type";
  resource: PropertyType | EntityType;
}) => {
  allowed: boolean;
  message: string;
};

export type EditorOntologyFunctions = Pick<
  GraphEmbedderMessageCallbacks,
  | "createPropertyType"
  | "updatePropertyType"
  | "createEntityType"
  | "updateEntityType"
> & {
  validateTitle: TitleValidationFunction;
  canEditResource: canEditResourceFunction;
};

export const OntologyFunctionsContext =
  createContext<EditorOntologyFunctions | null>(null);

export const useOntologyFunctions = () => {
  const ontologyFunctions = useContext(OntologyFunctionsContext);

  return ontologyFunctions;
};
