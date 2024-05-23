import type { PropsWithChildren } from "react";
import { createContext, useContext } from "react";

import type { LocalStorage } from "../../../../shared/storage";
// eslint-disable-next-line no-restricted-imports
import { useUserValue } from "../../../shared/use-user-value";

export type PopupUserContextType = {
  loading: boolean;
  user: LocalStorage["user"] | null;
};

export const PopupUserContext = createContext<PopupUserContextType | null>(
  null,
);

export const PopupUserContextProvider = ({ children }: PropsWithChildren) => {
  const value = useUserValue();

  return (
    <PopupUserContext.Provider value={value}>
      {children}
    </PopupUserContext.Provider>
  );
};

export const useUserContext = () => {
  const popupUserContext = useContext(PopupUserContext);

  if (!popupUserContext) {
    throw new Error("no PopupUserContext value has been provided");
  }

  return popupUserContext;
};
