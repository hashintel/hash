import { createContext, useContext } from "react";

import { useHashInstance } from "../../../../components/hooks/use-hash-instance";

import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { Account as GoogleAccount } from "@local/hash-isomorphic-utils/system-types/google/account";

export type GoogleAuthContextReturn =
  | {
      available: true;
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
      available: true;
      loading: true;
    }
  | {
      available: false;
    }
  | null;

const googleOAuthClientId = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID;

export const GoogleAuthContext = createContext<GoogleAuthContextReturn>(null);

export const useIsGoogleAuthAvailable = () => {
  const { enabledIntegrations } = useHashInstance();

  return !!googleOAuthClientId && enabledIntegrations.googleSheets;
};

export const useGoogleAuth = () => {
  const value = useContext(GoogleAuthContext);

  if (value === null) {
    throw new Error("useGoogleAuth must be used within a GoogleAuthProvider");
  }

  return value;
};
