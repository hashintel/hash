/* eslint-disable import/first */
// @todo have webpack polyfill this
require("setimmediate");

import { ApolloProvider } from "@apollo/client/react";
import { useEffect } from "react";
import { createApolloClient } from "@hashintel/hash-shared/graphql/createApolloClient";
import withTwindApp from "@twind/next/app";
import { ModalProvider } from "react-modal-hook";
import { configureScope } from "@sentry/nextjs";
import { AppProps } from "next/app";
import { useRouter } from "next/router";
import { PageLayout } from "../components/layout/PageLayout/PageLayout";

import twindConfig from "../../twind.config";
import "../../styles/globals.scss";
import { useUser } from "../components/hooks/useUser";

export const apolloClient = createApolloClient();

const MyApp: React.VoidFunctionComponent<AppProps> = ({
  Component,
  pageProps,
}) => {
  const router = useRouter();

  const { user } = useUser({ client: apolloClient });

  useEffect(
    () =>
      configureScope((scope) =>
        // eslint-disable-next-line no-console -- TODO: consider using logger
        console.log(`Build: ${scope.getSession()?.release ?? "not set"}`),
      ),
    [],
  );

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
      <ModalProvider>
        <PageLayout>
          <Component {...pageProps} />
        </PageLayout>
      </ModalProvider>
    </ApolloProvider>
  );
};

export default withTwindApp(twindConfig, MyApp);
