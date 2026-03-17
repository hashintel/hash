import { createContext, use } from "react";

import type { Color } from "../../../../../core/types/sdcpn";

export interface TypePropertiesContextValue {
  type: Color;
  updateType: (typeId: string, updateFn: (type: Color) => void) => void;
}

export const TypePropertiesContext =
  createContext<TypePropertiesContextValue | null>(null);

export const useTypePropertiesContext = (): TypePropertiesContextValue => {
  const context = use(TypePropertiesContext);
  if (!context) {
    throw new Error(
      "useTypePropertiesContext must be used within TypeProperties",
    );
  }
  return context;
};
