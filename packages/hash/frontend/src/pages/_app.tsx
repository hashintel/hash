// @todo have webpack polyfill this
require("setimmediate");

import { useRouter } from "next/router";
import { AppProps } from "next/dist/next-server/lib/router/router";
import { ApolloProvider, useQuery } from "@apollo/client/react";
import { useEffect, useMemo } from "react";
import { createApolloClient } from "@hashintel/hash-shared/src/graphql/createApolloClient";
import withTwindApp from "@twind/next/app";
import { PageLayout } from "../components/layout/PageLayout/PageLayout";
import { ModalProvider } from "react-modal-hook";

import twindConfig from "../../twind.config";
import "../../styles/prism.css";
import "../../styles/globals.scss";
import { UserContext } from "../components/contexts/UserContext";
import { meQuery } from "../graphql/queries/user.queries";
import { MeQuery, MeQueryVariables } from "../graphql/apiTypes.gen";
import { ApolloError } from "@apollo/client";

export const apolloClient = createApolloClient();

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();

  const { data, refetch, loading } = useQuery<MeQuery, MeQueryVariables>(
    meQuery,
    {
      onError: ({ graphQLErrors }) =>
        graphQLErrors.map((graphQLError) => {
          if (graphQLError.extensions?.code !== "FORBIDDEN") {
            throw new ApolloError({ graphQLErrors });
          }
        }),
      client: apolloClient, // has to be provided as this query operates outside ApolloProvider
    }
  );

  const user = data?.me;

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

export default withTwindApp(twindConfig, MyApp);
