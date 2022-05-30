/* eslint-disable import/first */
// @todo have webpack polyfill this
require("setimmediate");

import { ApolloProvider } from "@apollo/client/react";
import { useEffect, useState } from "react";
import { createApolloClient } from "@hashintel/hash-shared/graphql/createApolloClient";
import withTwindApp from "@twind/next/app";
import { ModalProvider } from "react-modal-hook";
import { configureScope } from "@sentry/nextjs";
import { AppProps as NextAppProps } from "next/app";
import { useRouter } from "next/router";
import { CacheProvider, EmotionCache } from "@emotion/react";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { theme, createEmotionCache } from "@hashintel/hash-design-system/ui";
import { getPlainLayout, NextPageWithLayout } from "../shared/layout";

import twindConfig from "../../twind.config";
import "../../styles/globals.scss";
import { useUser } from "../components/hooks/useUser";
import {
  RouteAccountInfoProvider,
  RoutePageInfoProvider,
} from "../shared/routing";

export const apolloClient = createApolloClient();

const clientSideEmotionCache = createEmotionCache();

type AppProps = {
  emotionCache?: EmotionCache;
  Component: NextPageWithLayout;
} & NextAppProps;

const App: React.VoidFunctionComponent<AppProps> = ({
  Component,
  pageProps,
  emotionCache = clientSideEmotionCache,
}) => {
  // Helps prevent tree mismatch between server and client on initial render
  const [ssr, setSsr] = useState(true);
  const router = useRouter();

  const { user } = useUser({ client: apolloClient });

  useEffect(() => {
    configureScope((scope) =>
      // eslint-disable-next-line no-console -- TODO: consider using logger
      console.log(`Build: ${scope.getSession()?.release ?? "not set"}`),
    );
    setSsr(false);
  }, []);

  useEffect(() => {
    if (
      user &&
      !user.accountSignupComplete &&
      !router.pathname.startsWith("/signup")
    ) {
      void router.push("/signup");
    }
  }, [user, router]);

  // App UI often depends on [account-slug] and other query params. However,
  // router.query is empty during server-side rendering for pages that don’t use
  // getServerSideProps. By showing app skeleton on the server, we avoid UI
  // mismatches during rehydration and improve type-safety of param extraction.
  if (ssr || !router.isReady) {
    return null; // Replace with app skeleton
  }

  const getLayout = Component.getLayout || getPlainLayout;
  return (
    <ApolloProvider client={apolloClient}>
      <CacheProvider value={emotionCache}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <ModalProvider>
            <RouteAccountInfoProvider>
              <RoutePageInfoProvider>
                {getLayout(<Component {...pageProps} />)}
              </RoutePageInfoProvider>
            </RouteAccountInfoProvider>
          </ModalProvider>
        </ThemeProvider>
      </CacheProvider>
    </ApolloProvider>
  );
};

export default withTwindApp(twindConfig, App);
