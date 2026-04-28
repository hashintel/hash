import { createContext, use } from "react";

import type {
  ComponentInstance,
  Parameter,
  Subnet,
} from "../../../../../core/types/sdcpn";

export interface ComponentInstancePropertiesContextValue {
  instance: ComponentInstance;
  subnet: Subnet | null;
  subnetParameters: Parameter[];
  updateComponentInstance: (
    instanceId: string,
    updateFn: (instance: ComponentInstance) => void,
  ) => void;
}

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
