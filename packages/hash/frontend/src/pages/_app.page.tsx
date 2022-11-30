/* eslint-disable import/first */
// @todo have webpack polyfill this
require("setimmediate");

import { ApolloProvider } from "@apollo/client/react";
import { FunctionComponent, useEffect, useState } from "react";
import { createApolloClient } from "@hashintel/hash-shared/graphql/createApolloClient";
import withTwindApp from "@twind/next/app";
import { ModalProvider } from "react-modal-hook";
import { configureScope } from "@sentry/nextjs";
import { AppProps as NextAppProps } from "next/app";
import { useRouter } from "next/router";
import { CacheProvider, EmotionCache } from "@emotion/react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { theme, createEmotionCache } from "@hashintel/hash-design-system";
import { SnackbarProvider } from "notistack";
import { TypeSystemContextProvider } from "../lib/use-init-type-system";
import { getPlainLayout, NextPageWithLayout } from "../shared/layout";

import { SessionProvider } from "./_app.page/session-provider";
import twindConfig from "../../twind.config";
import "./globals.scss";
import { useAuthenticatedUser } from "../components/hooks/useAuthenticatedUser";
import {
  RouteAccountInfoProvider,
  RoutePageInfoProvider,
} from "../shared/routing";
import { ReadonlyModeProvider } from "../shared/readonly-mode";

export const apolloClient = createApolloClient();

const clientSideEmotionCache = createEmotionCache();

type AppProps = {
  emotionCache?: EmotionCache;
  Component: NextPageWithLayout;
} & NextAppProps;

const App: FunctionComponent<AppProps> = ({
  Component,
  pageProps,
  emotionCache = clientSideEmotionCache,
}) => {
  // Helps prevent tree mismatch between server and client on initial render
  const [ssr, setSsr] = useState(true);
  const router = useRouter();

  const { authenticatedUser, loading, kratosSession, refetch } =
    useAuthenticatedUser({
      client: apolloClient,
    });

  useEffect(() => {
    configureScope((scope) =>
      // eslint-disable-next-line no-console -- TODO: consider using logger
      console.log(`Build: ${scope.getSession()?.release ?? "not set"}`),
    );
    setSsr(false);
  }, []);

  useEffect(() => {
    // If the user is logged in but hasn't completed signup and isn't on the signup page...
    if (
      authenticatedUser &&
      !authenticatedUser.accountSignupComplete &&
      !router.pathname.startsWith("/signup")
    ) {
      // ...then redirect them to the signup page.
      void router.push("/signup");
      // If the user is logged out redirect them to the login page
    } else if (
      !loading &&
      !authenticatedUser &&
      !router.pathname.startsWith("/login")
    ) {
      if (kratosSession) {
        /**
         * If we have a kratos session, but could not get the authenticated user,
         * the kratos session may be invalid so needs to be re-fetched before redirecting.
         */
        void refetch().then(() => router.push("/login"));
      } else {
        void router.push("/login");
      }
    }
  }, [authenticatedUser, kratosSession, loading, refetch, router]);

  // App UI often depends on [account-slug] and other query params. However,
  // router.query is empty during server-side rendering for pages that don’t use
  // getServerSideProps. By showing app skeleton on the server, we avoid UI
  // mismatches during rehydration and improve type-safety of param extraction.
  if (ssr || !router.isReady) {
    return null; // Replace with app skeleton
  }

  const getLayout = Component.getLayout ?? getPlainLayout;

  return (
    <ApolloProvider client={apolloClient}>
      <CacheProvider value={emotionCache}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <ModalProvider>
            <RouteAccountInfoProvider>
              <RoutePageInfoProvider>
                <ReadonlyModeProvider>
                  <SnackbarProvider maxSnack={3}>
                    {getLayout(<Component {...pageProps} />)}
                  </SnackbarProvider>
                </ReadonlyModeProvider>
              </RoutePageInfoProvider>
            </RouteAccountInfoProvider>
          </ModalProvider>
        </ThemeProvider>
      </CacheProvider>
    </ApolloProvider>
  );
};

const AppWithTypeSystemContextProvider: FunctionComponent<AppProps> = (
  props,
) => (
  <TypeSystemContextProvider>
    <SessionProvider>
      <App {...props} />
    </SessionProvider>
  </TypeSystemContextProvider>
);

export default withTwindApp(twindConfig, AppWithTypeSystemContextProvider);
