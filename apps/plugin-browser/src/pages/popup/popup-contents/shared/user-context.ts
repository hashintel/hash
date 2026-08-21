import { createContext, useContext } from "react";

import type { LocalStorage } from "../../../../shared/storage";

export type PopupUserContextType = {
  loading: boolean;
  user: LocalStorage["user"] | null;
};

export const PopupUserContext = createContext<PopupUserContextType | null>(
  null,
);

export const useUserContext = () => {
  const popupUserContext = useContext(PopupUserContext);

  if (!popupUserContext) {
    throw new Error("no PopupUserContext value has been provided");
  }

  return popupUserContext;
};
