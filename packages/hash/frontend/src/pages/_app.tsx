// @todo have webpack polyfill this
require("setimmediate");

import { useRouter } from "next/router";
import { AppProps } from "next/dist/next-server/lib/router/router";
import { ApolloProvider } from "@apollo/client/react";
import { useEffect, useMemo } from "react";
import { createApolloClient } from "@hashintel/hash-shared/src/graphql/createApolloClient";
import withTwindApp from "@twind/next/app";
import { PageLayout } from "../components/layout/PageLayout/PageLayout";
import { ModalProvider } from "react-modal-hook";

import { ApolloError, useQuery } from "@apollo/client";
import { meQuery } from "../graphql/queries/user.queries";
import { MeQuery, MeQueryVariables } from "../graphql/apiTypes.gen";

import "../../styles/prism.css";
import "../../styles/globals.scss";
import { UserContext } from "../components/contexts/UserContext";
import { useFetchUser } from "../components/hooks/useFetchUser";

export const apolloClient = createApolloClient();

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();

  const { user, refetch, loading } = useFetchUser(apolloClient);

  useEffect(() => {
    if (
      user &&
      !user.accountSignupComplete &&
      !router.pathname.startsWith("/signup")
    ) {
      void router.push("/signup");
    }
  }, [user, router]);

  const userContextValue = useMemo(
    () => ({
      user,
      refetch,
      loading,
    }),
    [user, refetch, loading]
  );

  return (
    <ApolloProvider client={apolloClient}>
      <UserContext.Provider value={userContextValue}>
        <ModalProvider>
          <PageLayout>
            <Component {...pageProps} />
          </PageLayout>
        </ModalProvider>
      </UserContext.Provider>
    </ApolloProvider>
  );
}

export default withTwindApp(MyApp);
