import { createContext, useContext } from "react";
import { FlattenedCustomExpectedValueList } from "../../../shared/expected-value-types";

export type CustomExpectedValueBuilderContextValue = {
  customExpectedValueBuilderOpen: boolean;
  openCustomExpectedValueBuilder: () => void;
  closeCustomExpectedValueBuilder: () => void;
  handleSave: (nextValues: FlattenedCustomExpectedValueList) => void;
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
