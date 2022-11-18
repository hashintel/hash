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

  const { authenticatedUser } = useAuthenticatedUser({ client: apolloClient });

  useEffect(() => {
    configureScope((scope) =>
      // eslint-disable-next-line no-console -- TODO: consider using logger
      console.log(`Build: ${scope.getSession()?.release ?? "not set"}`),
    );
    setSsr(false);
  }, []);

  useEffect(() => {
    if (
      authenticatedUser &&
      !authenticatedUser.accountSignupComplete &&
      !router.pathname.startsWith("/signup")
    ) {
      void router.push("/signup");
    }
  }, [authenticatedUser, router]);

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
                <SessionProvider>
                  <ReadonlyModeProvider>
                    <SnackbarProvider maxSnack={3}>
                      {getLayout(<Component {...pageProps} />)}
                    </SnackbarProvider>
                  </ReadonlyModeProvider>
                </SessionProvider>
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
    <App {...props} />
  </TypeSystemContextProvider>
);

export default withTwindApp(twindConfig, AppWithTypeSystemContextProvider);
