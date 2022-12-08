import { createContext, useContext } from "react";

export type DataTypeSelectorDropdownContextValue = {
  customDataTypeMenuOpen: boolean;
  openCustomDataTypeMenu: () => void;
  closeCustomDataTypeMenu: () => void;
};
export const DataTypeSelectorDropdownContext =
  createContext<DataTypeSelectorDropdownContextValue | null>(null);

export const useDataTypeSelectorDropdownContext = () => {
  const value = useContext(DataTypeSelectorDropdownContext);
  if (value === null) {
    throw new Error("Must wrap with DataTypeSelectorDropdownContext.Provider");
  }
  return value;
};
