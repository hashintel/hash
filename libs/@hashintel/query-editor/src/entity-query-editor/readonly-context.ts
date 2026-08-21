import { createContext, useContext } from "react";

export const ReadonlyContext = createContext(false);

export const useReadonlyContext = () => {
  return useContext(ReadonlyContext);
};
