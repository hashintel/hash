import { ReactElement, useMemo, useState } from "react";
import { Session } from "@ory/client";

import { SessionContext } from "../shared/session-context";

export const SessionProvider = ({ children }: { children: ReactElement }) => {
  const [kratosSession, setKratosSession] = useState<Session>();
  const [loadingKratosSession, setLoadingKratosSession] =
    useState<boolean>(true);

  const value = useMemo(
    () => ({
      kratosSession,
      loadingKratosSession,
      setKratosSession,
      setLoadingKratosSession,
    }),
    [
      kratosSession,
      loadingKratosSession,
      setKratosSession,
      setLoadingKratosSession,
    ],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
};
