import { createContext, use } from "react";

import type {
  ComponentInstance,
  Parameter,
  PetrinautMutations,
  Subnet,
} from "@hashintel/petrinaut-core";

export type ComponentInstancePropertiesContextValue = {
  instance: ComponentInstance;
  subnet: Subnet | null;
  subnetParameters: Parameter[];
  updateComponentInstance: PetrinautMutations["updateComponentInstance"];
};

export const ComponentInstancePropertiesContext =
  createContext<ComponentInstancePropertiesContextValue | null>(null);

export const useComponentInstancePropertiesContext =
  (): ComponentInstancePropertiesContextValue => {
    const context = use(ComponentInstancePropertiesContext);
    if (!context) {
      throw new Error(
        "useComponentInstancePropertiesContext must be used within ComponentInstanceProperties",
      );
    }
    return context;
  };
