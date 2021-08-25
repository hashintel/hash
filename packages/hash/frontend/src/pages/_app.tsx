// @todo have webpack polyfill this
require("setimmediate");

import { useRouter } from "next/router";
import { AppProps } from "next/dist/next-server/lib/router/router";
import { ApolloProvider } from "@apollo/client/react";
import { createApolloClient } from "@hashintel/hash-shared/src/graphql/createApolloClient";
import withTwindApp from "@twind/next/app";
import { PageLayout } from "../components/layout/PageLayout/PageLayout";
import { ModalProvider } from "react-modal-hook";

import { useQuery } from "@apollo/client";
import { meQuery } from "../graphql/queries/user.queries";
import { MeQuery, MeQueryVariables } from "../graphql/apiTypes.gen";

import "../../styles/prism.css";
import "../../styles/globals.scss";
import UserContext from "../components/contexts/UserContext";
import { useEffect } from "react";

export const apolloClient = createApolloClient();

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();

  const { data, refetch, loading } = useQuery<MeQuery, MeQueryVariables>(
    meQuery,
    { client: apolloClient } // has to be provided as this query operates outside ApolloProvider
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

  return (
    <ApolloProvider client={apolloClient}>
      <UserContext.Provider
        value={{
          user,
          refetch,
          loading,
        }}
      >
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
