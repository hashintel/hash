import { createContext, useContext } from "react";

import { CustomizationOptions } from "../entity-type-editor";

export const CustomizationContext = createContext<CustomizationOptions | null>(
  null,
);

export const useCustomizationSettings = () => {
  const customizationContext = useContext(CustomizationContext);

  if (customizationContext === null) {
    throw new Error("no ReadonlyEntitiesContext value has been provided");
  }

  return customizationContext;
};
