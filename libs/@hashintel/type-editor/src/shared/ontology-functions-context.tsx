import { EmbedderGraphMessageCallbacks } from "@blockprotocol/graph";
import { createContext, useContext } from "react";

export type TitleValidationFunction = (proposal: {
  kind: "entity-type" | "property-type";
  title: string;
}) => Promise<{
  allowed: boolean;
  message: string;
}>;

export type EditorOntologyFunctions = Pick<
  EmbedderGraphMessageCallbacks<false>,
  | "createPropertyType"
  | "updatePropertyType"
  | "createEntityType"
  | "updateEntityType"
> & { validateTitle: TitleValidationFunction };

export const OntologyFunctionsContext =
  createContext<EditorOntologyFunctions | null>(null);

export const useOntologyFunctions = () => {
  const ontologyFunctions = useContext(OntologyFunctionsContext);

  if (!ontologyFunctions) {
    throw new Error("no OntologyFunctionsContext value has been provided");
  }

  return ontologyFunctions;
};
