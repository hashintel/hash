import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import type { RefObject } from "react";
import { createContext, useContext } from "react";

export type ExpectedValueSelectorContextValue = {
  addDataType: (dataTypeId: VersionedUrl) => void;
  autocompleteFocused: boolean;
  closeAutocomplete: () => void;
  customExpectedValueBuilderOpen: boolean;
  handleEdit: (index?: number, id?: string) => void;
  handleCancelCustomBuilder: () => void;
  handleSave: () => void;
  inputRef?: RefObject<HTMLInputElement | null | undefined>;
  searchText: string;
};

export const ExpectedValueSelectorContext =
  createContext<ExpectedValueSelectorContextValue | null>(null);

export const useExpectedValueSelectorContext = () => {
  const value = useContext(ExpectedValueSelectorContext);
  if (value === null) {
    throw new Error("Must wrap with ExpectedValueSelectorContext.Provider");
  }
  return value;
};
