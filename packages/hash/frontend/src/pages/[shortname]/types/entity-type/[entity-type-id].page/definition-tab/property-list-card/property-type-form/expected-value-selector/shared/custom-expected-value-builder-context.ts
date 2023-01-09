import { createContext, useContext } from "react";

export type CustomExpectedValueBuilderContextValue = {
  customExpectedValueBuilderOpen: boolean;
  openCustomExpectedValueBuilder: (index?: number, id?: string) => void;
  closeCustomExpectedValueBuilder: () => void;
  handleSave: () => void;
};
export const CustomExpectedValueBuilderContext =
  createContext<CustomExpectedValueBuilderContextValue | null>(null);

export const useCustomExpectedValueBuilderContext = () => {
  const value = useContext(CustomExpectedValueBuilderContext);
  if (value === null) {
    throw new Error(
      "Must wrap with CustomExpectedValueBuilderContext.Provider",
    );
  }
  return value;
};
