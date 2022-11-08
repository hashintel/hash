import { createContext } from "react";
import { Session } from "@ory/client";

type SessionState = {
  kratosSession?: Session;
  setKratosSession: (session?: Session) => void;
  loadingKratosSession: boolean;
  setLoadingKratosSession: (loading: boolean) => void;
};

export const SessionContext = createContext<SessionState>({
  kratosSession: undefined,
  setKratosSession: () => {},
  loadingKratosSession: true,
  setLoadingKratosSession: () => {},
});
