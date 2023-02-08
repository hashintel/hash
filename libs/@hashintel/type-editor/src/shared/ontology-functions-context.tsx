import { createContext, useContext } from "react";
import { EmbedderGraphMessageCallbacks } from "@blockprotocol/graph";

export type EditorOntologyFunctions = Pick<
  EmbedderGraphMessageCallbacks<false>,
  | "getPropertyType"
  | "createPropertyType"
  | "updatePropertyType"
  | "getEntityType"
  | "createEntityType"
  | "updateEntityType"
>;

export const OntologyFunctionsContext =
  createContext<EditorOntologyFunctions | null>(null);

export const useOntologyFunctions = () => {
  const ontologyFunctions = useContext(OntologyFunctionsContext);

  if (!ontologyFunctions) {
    throw new Error("no OntologyFunctionsContext value has been provided");
  }

  return ontologyFunctions;
};
