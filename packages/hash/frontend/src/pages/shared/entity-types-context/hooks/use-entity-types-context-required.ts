import { useContext } from "react";

import { EntityTypesContext } from "../shared/context";

export const useEntityTypesContextRequired = () => {
  const context = useContext(EntityTypesContext);

  if (!context) {
    throw new Error("Context missing");
  }

  return context;
};
