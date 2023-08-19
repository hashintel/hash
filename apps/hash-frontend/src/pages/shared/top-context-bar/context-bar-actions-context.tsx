import { createContext, useContext } from "react";

export const ContextBarActionsContext = createContext<
  | {
      closeContextMenu: () => void;
    }
  | undefined
>(undefined);

export const useContextBarActionsContext = () => {
  const context = useContext(ContextBarActionsContext);

  if (!context) {
    throw new Error("TopContextBarActionsContext not implemented.");
  }

  return context;
};
