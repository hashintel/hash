import { useContext, useEffect } from "react";

import { EntityTypesContext } from "../shared/context";

export const useEntityTypesContextRequired = () => {
  const context = useContext(EntityTypesContext);

  if (!context) {
    throw new Error("Context missing");
  }

  useEffect(() => {
    context.ensureFetched();
  });

  return context;
};
