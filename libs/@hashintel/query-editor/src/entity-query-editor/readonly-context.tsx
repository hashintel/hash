import { createContext, useContext } from "react";

const ReadonlyContext = createContext(false);

export const ReadonlyContextProvider = ({
  children,
  readonly,
}: {
  children: React.ReactNode;
  readonly: boolean;
}) => {
  return (
    <ReadonlyContext.Provider value={readonly}>
      {children}
    </ReadonlyContext.Provider>
  );
};

export const useReadonlyContext = () => {
  return useContext(ReadonlyContext);
};
