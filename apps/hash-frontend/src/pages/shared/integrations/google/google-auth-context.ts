import { createContext, useContext } from "react";

import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { Account as GoogleAccount } from "@local/hash-isomorphic-utils/system-types/google/account";

export type GoogleAuthContextReturn =
  | {
      accounts: HashEntity<GoogleAccount>[];
      addGoogleAccount: () => void;
      checkAccessToken: (args: {
        googleAccountId: string;
      }) => Promise<{ accessToken: true }>;
      getAccessToken: (args: {
        googleAccountId: string;
      }) => Promise<{ accessToken: string }>;
      loading: false;
    }
  | {
      loading: true;
    }
  | null;

export const GoogleAuthContext = createContext<GoogleAuthContextReturn>(null);

export const useGoogleAuth = () => {
  const value = useContext(GoogleAuthContext);

  if (value === null) {
    throw new Error("useGoogleAuth must be used within a GoogleAuthProvider");
  }

  return value;
};
