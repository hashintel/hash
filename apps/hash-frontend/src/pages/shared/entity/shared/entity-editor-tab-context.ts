import { createContext, useContext } from "react";

export type EntityEditorTab = "overview" | "history";

export const defaultTab: EntityEditorTab = "overview";

interface EntityEditorTabContextValue {
  tab: EntityEditorTab;
  setTab: (tab: EntityEditorTab) => void;
}

export const EntityEditorTabContext =
  createContext<EntityEditorTabContextValue | null>(null);

export const useEntityEditorTab = () => {
  const context = useContext(EntityEditorTabContext);
  if (!context) {
    throw new Error(
      "useEntityEditorTab must be used within an EntityEditorTabProvider",
    );
  }
  return context;
};
