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
import { CacheProvider, EmotionCache } from "@emotion/react";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { theme, createEmotionCache } from "../shared/ui";
import { PageLayout } from "../components/layout/PageLayout/PageLayout";

import twindConfig from "../../twind.config";
import "../../styles/globals.scss";
import { useUser } from "../components/hooks/useUser";
import { SidebarContextProvider } from "../components/layout/SidebarContext";
import {
  RouteAccountInfoProvider,
  RoutePageInfoProvider,
} from "../shared/routing";

export const apolloClient = createApolloClient();

const clientSideEmotionCache = createEmotionCache();

type CustomAppProps = {
  emotionCache?: EmotionCache;
} & AppProps;

const MyApp: React.VoidFunctionComponent<CustomAppProps> = ({
  Component,
  pageProps,
  emotionCache = clientSideEmotionCache,
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

  // App UI often depends on [account-slug] and other query params. However,
  // router.query is empty during server-side rendering for pages that don’t use
  // getServerSide props. By showing app skeleton on the server, we avoid UI
  // mismatches during rehydration
  if (!router.isReady) {
    return null; // Replace with app skeleton
  }

  return (
    <ApolloProvider client={apolloClient}>
      <CacheProvider value={emotionCache}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <ModalProvider>
            <RouteAccountInfoProvider>
              <RoutePageInfoProvider>
                <SidebarContextProvider>
                  <PageLayout>
                    <Component {...pageProps} />
                  </PageLayout>
                </SidebarContextProvider>
              </RoutePageInfoProvider>
            </RouteAccountInfoProvider>
          </ModalProvider>
        </ThemeProvider>
      </CacheProvider>
    </ApolloProvider>
  );
};

export default withTwindApp(twindConfig, MyApp);
