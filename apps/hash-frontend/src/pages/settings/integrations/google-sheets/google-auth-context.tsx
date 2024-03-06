import { apiOrigin } from "@local/hash-isomorphic-utils/environment";
import { GoogleAccountProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { Entity } from "@local/hash-subgraph";
import Script from "next/script";
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { useGoogleAccounts } from "./google-auth-context/use-google-accounts";

const googleOAuthClientId = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID;

type GoogleAuthContextReturn =
  | {
      accounts: Entity<GoogleAccountProperties>[];
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

const GoogleAuthContext = createContext<GoogleAuthContextReturn>(null);

export const GoogleAuthProvider = ({ children }: PropsWithChildren) => {
  const [oauthClient, setOAuthClient] =
    useState<google.accounts.oauth2.CodeClient | null>(null);

  const {
    accounts,
    loading: accountsLoading,
    refetch: refetchAccounts,
  } = useGoogleAccounts();

  const getAccessToken = useCallback(
    async ({
      googleAccountId,
    }: {
      googleAccountId: string;
    }): Promise<{ accessToken: string }> => {
      return await fetch(`${apiOrigin}/oauth/google/token`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ googleAccountId }),
      }).then(async (resp) => {
        if (resp.status === 200) {
          return resp.json();
        }
        const error = await resp.json();
        throw new Error(error.error);
      });
    },
    [],
  );

  const checkAccessToken = useCallback(
    async ({
      googleAccountId,
    }: {
      googleAccountId: string;
    }): Promise<{ accessToken: true }> => {
      return fetch(`${apiOrigin}/oauth/google/check-token`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ googleAccountId }),
      }).then((resp) => resp.json());
    },
    [],
  );

  const loadOAuthClient = () => {
    if (!googleOAuthClientId) {
      throw new Error("GOOGLE_OAUTH_CLIENT_ID is not set");
    }

    const client = google.accounts.oauth2.initCodeClient({
      client_id: googleOAuthClientId,
      scope:
        /**
         * Scopes required:
         * drive.file in order to create new files or to read/update/delete existing files that the user picks
         * userinfo.email in order to know which Google account the token is associated with, in case the user has
         * multiple
         */
        "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email",
      ux_mode: "popup",
      callback: async (response) => {
        if (response.error === "access_denied") {
          return null;
        } else if (response.error) {
          throw new Error(`Google OAuth error: ${response.error}`);
        }

        const apiResponse = await fetch(`${apiOrigin}/oauth/google/callback`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ code: response.code }),
        }).then((resp) => resp.json());

        refetchAccounts();

        return { accessToken: apiResponse.accessToken };
      },
    });

    setOAuthClient(client);
  };

  const value = useMemo<GoogleAuthContextReturn>(() => {
    if (oauthClient && !accountsLoading) {
      return {
        accounts,
        addGoogleAccount: () => {
          oauthClient.requestCode();
        },
        checkAccessToken,
        getAccessToken,
        loading: false,
      };
    } else {
      return {
        loading: true,
      };
    }
  }, [
    accounts,
    accountsLoading,
    checkAccessToken,
    getAccessToken,
    oauthClient,
  ]);

  return (
    <GoogleAuthContext.Provider value={value}>
      <Script
        src="https://accounts.google.com/gsi/client"
        onLoad={loadOAuthClient}
      />
      {children}
    </GoogleAuthContext.Provider>
  );
};

export const useGoogleAuth = () => {
  const value = useContext(GoogleAuthContext);

  if (value === null) {
    throw new Error("useGoogleAuth must be used within a GoogleAuthProvider");
  }

  return value;
};
