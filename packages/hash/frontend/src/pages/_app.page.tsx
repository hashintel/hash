/* eslint-disable import/first */
// @todo have webpack polyfill this
require("setimmediate");

import { NextPage } from "next";
import { ApolloProvider } from "@apollo/client/react";
import { ReactElement, ReactNode, useEffect } from "react";
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
import { SidebarContextProvider } from "../shared/layout";

import twindConfig from "../../twind.config";
import "../../styles/globals.scss";
import { useUser } from "../components/hooks/useUser";
import {
  RouteAccountInfoProvider,
  RoutePageInfoProvider,
} from "../shared/routing";

export const apolloClient = createApolloClient();

const clientSideEmotionCache = createEmotionCache();

type NextPageWithLayout = NextPage & {
  getLayout?: (page: ReactElement) => ReactNode;
};

type CustomAppProps = {
  emotionCache?: EmotionCache;
  Component: NextPageWithLayout;
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
  // getServerSideProps. By showing app skeleton on the server, we avoid UI
  // mismatches during rehydration and improve type-safety of param extraction.
  if (!router.isReady) {
    return null; // Replace with app skeleton
  }

  const getLayout = Component.getLayout || ((page) => page);

  return (
    <ApolloProvider client={apolloClient}>
      <CacheProvider value={emotionCache}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <ModalProvider>
            <RouteAccountInfoProvider>
              <RoutePageInfoProvider>
                <SidebarContextProvider>
                  {getLayout(<Component {...pageProps} />)}
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
