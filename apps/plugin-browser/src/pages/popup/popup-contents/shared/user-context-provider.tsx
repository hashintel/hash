// eslint-disable-next-line no-restricted-imports
import { useUserValue } from "../../../shared/use-user-value";
import { PopupUserContext } from "./user-context";

import type { PropsWithChildren } from "react";

export const PopupUserContextProvider = ({ children }: PropsWithChildren) => {
  const value = useUserValue();

  return (
    <PopupUserContext.Provider value={value}>
      {children}
    </PopupUserContext.Provider>
  );
};
