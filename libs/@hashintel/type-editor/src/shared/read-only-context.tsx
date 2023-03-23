import { createContext, useContext } from "react";

export const ReadonlyContext = createContext<boolean | null>(null);

export const useIsReadonly = () => {
  return true;
  const readonlyContext = useContext(ReadonlyContext);

  if (readonlyContext === null) {
    throw new Error("no ReadonlyEntitiesContext value has been provided");
  }

  return readonlyContext;
};
