import { ReadonlyContext } from "./readonly-context";

import type { ReactNode } from "react";

export const ReadonlyContextProvider = ({
  children,
  readonly,
}: {
  children: ReactNode;
  readonly: boolean;
}) => {
  return (
    <ReadonlyContext.Provider value={readonly}>
      {children}
    </ReadonlyContext.Provider>
  );
};
