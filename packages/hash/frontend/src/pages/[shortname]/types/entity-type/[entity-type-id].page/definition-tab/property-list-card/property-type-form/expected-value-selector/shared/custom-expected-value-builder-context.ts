import { createContext, useContext } from "react";

export type CustomExpectedValueBuilderContextValue = {
  customExpectedValueBuilderOpen: boolean;
  handleEdit: (index?: number, id?: string) => void;
  handleCancel: () => void;
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
