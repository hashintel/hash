import "./_app.page/why-did-you-render";

import "setimmediate";

// React Grid Layout CSS for dashboard drag-and-drop
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import "./globals.scss";
import "./prism.css";
import "./ds-components-styles.gen.css";
import { ApolloProvider } from "@apollo/client/react/index.js";
import { CacheProvider } from "@emotion/react";
import { CssBaseline, GlobalStyles, ThemeProvider } from "@mui/material";
import { ErrorBoundary, getClient } from "@sentry/nextjs";
import { useRouter } from "next/router";
import { SnackbarProvider } from "notistack";
import { Suspense, useEffect, useState } from "react";

import { createEmotionCache, theme } from "@hashintel/design-system/theme";

import { apolloClient } from "../lib/apollo-client";
import { DraftEntitiesCountContextProvider } from "../shared/draft-entities-count-context";
import { EntityTypesContextProvider } from "../shared/entity-types-context/provider";
import { FileUploadsProvider } from "../shared/file-upload-context";
import { InvitesContextProvider } from "../shared/invites-context";
import { KeyboardShortcutsContextProvider } from "../shared/keyboard-shortcuts-context";
import { getLayoutWithSidebar, getPlainLayout } from "../shared/layout";
import { SidebarContextProvider } from "../shared/layout/layout-with-sidebar/sidebar-context";
import { NotificationCountContextProvider } from "../shared/notification-count-context";
import { PropertyTypesContextProvider } from "../shared/property-types-context";
import { RoutePageInfoProvider } from "../shared/routing";
import { trackPageView } from "../shared/telemetry-client";
import { ClientRouteGuard } from "./_app.page/client-route-guard";
import { ErrorFallback } from "./_app.page/error-fallback";
import { reportIframeReactError } from "./processes/shared/iframe-error-reporter";
import { AuthInfoProvider, useAuthInfo } from "./shared/auth-info-context";
import { DataTypesContextProvider } from "./shared/data-types-context";
import { setSentryUser } from "./shared/sentry";
import { SlideStackProvider } from "./shared/slide-stack";
import { WorkspaceContextProvider } from "./shared/workspace-context";

import type { NextPageWithLayout } from "../shared/layout";
import type { EmotionCache } from "@emotion/react";
import type { AppProps as NextAppProps } from "next/app";
import type { FunctionComponent } from "react";

const clientSideEmotionCache = createEmotionCache();

type AppProps = {
  emotionCache?: EmotionCache;
  Component: NextPageWithLayout;
} & NextAppProps;

const globalStyles = (
  <GlobalStyles
    styles={{
      /**
       * @see https://mui.com/material-ui/react-text-field/#performance
       */
      "@keyframes mui-auto-fill": { from: { display: "block" } },
      "@keyframes mui-auto-fill-cancel": { from: { display: "block" } },
      /* "spin" is used in some inline styles which have been temporarily introduced in https://github.com/hashintel/hash/pull/1471 */
      /* @todo remove when inline styles are replaced with MUI styles */
      "@keyframes spin": {
        from: {
          transform: "rotate(0deg)",
        },
        to: {
          transform: "rotate(360deg)",
        },
      },
    }}
  />
);

const App: FunctionComponent<AppProps> = ({
  Component,
  pageProps,
  emotionCache = clientSideEmotionCache,
}) => {
  // Helps prevent tree mismatch between server and client on initial render
  const [ssr, setSsr] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const release = getClient()?.getOptions().release;

    // eslint-disable-next-line no-console -- TODO: consider using logger
    console.log(`Build: ${release ?? "not set"}`);

    setSsr(false);
  }, []);

  const { authenticatedUser } = useAuthInfo();

  useEffect(() => {
    setSentryUser({ authenticatedUser });
  }, [authenticatedUser]);

  useEffect(() => {
    if (!router.isReady) {
      return undefined;
    }

    // Initial view (fires once the router is ready); subsequent views come from
    // `routeChangeComplete`. `router.asPath` is intentionally omitted from the
    // deps so we don't double-count navigations.
    trackPageView(router.asPath);

    const handleRouteChange = (url: string) => {
      trackPageView(url);
    };
    router.events.on("routeChangeComplete", handleRouteChange);
    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.events]);

  // App UI often depends on [shortname] and other query params. However,
  // router.query is empty during server-side rendering for pages that don’t use
  // getServerSideProps. By showing app skeleton on the server, we avoid UI
  // mismatches during rehydration and improve type-safety of param extraction.
  if (ssr || !router.isReady) {
    return <Suspense />; // Replace with app skeleton
  }

  const getLayout = Component.getLayout ?? getPlainLayout;

  return (
    <Suspense>
      <CacheProvider value={emotionCache}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <RoutePageInfoProvider>
            <WorkspaceContextProvider>
              <KeyboardShortcutsContextProvider>
                <SnackbarProvider maxSnack={3}>
                  <NotificationCountContextProvider>
                    <DraftEntitiesCountContextProvider>
                      <InvitesContextProvider>
                        <EntityTypesContextProvider>
                          <PropertyTypesContextProvider includeArchived>
                            <DataTypesContextProvider>
                              <FileUploadsProvider>
                                <SidebarContextProvider>
                                  <SlideStackProvider>
                                    <ErrorBoundary
                                      beforeCapture={(scope) => {
                                        scope.setTag("error-boundary", "_app");
                                      }}
                                      fallback={(props) =>
                                        getLayoutWithSidebar(
                                          <ErrorFallback {...props} />,
                                        )
                                      }
                                    >
                                      {getLayout(<Component {...pageProps} />)}
                                    </ErrorBoundary>
                                  </SlideStackProvider>
                                </SidebarContextProvider>
                              </FileUploadsProvider>
                            </DataTypesContextProvider>
                          </PropertyTypesContextProvider>
                        </EntityTypesContextProvider>
                      </InvitesContextProvider>
                    </DraftEntitiesCountContextProvider>
                  </NotificationCountContextProvider>
                </SnackbarProvider>
              </KeyboardShortcutsContextProvider>
            </WorkspaceContextProvider>
          </RoutePageInfoProvider>
        </ThemeProvider>
      </CacheProvider>
      {globalStyles}
    </Suspense>
  );
};

const PETRINAUT_EMBED_PATHNAME = "/processes/[uuid]/embed";

/**
 * Minimal `_app` shell for the Petrinaut embed route.
 */
const PetrinautEmbedAppShell: FunctionComponent<AppProps> = ({
  Component,
  pageProps,
  emotionCache = clientSideEmotionCache,
}) => (
  <Suspense>
    <CacheProvider value={emotionCache}>
      <ThemeProvider theme={theme}>
        <ErrorBoundary
          beforeCapture={(scope) => {
            scope.setTag("error-boundary", "_app-embed");
          }}
          /**
           * Forward into the host's Sentry. The boundary's local
           * captureException is a no-op here because Sentry isn't
           * initialised inside the embed iframe (see
           * `instrumentation-client.ts`).
           */
          onError={(error) => reportIframeReactError(error)}
          fallback={ErrorFallback}
        >
          <Component {...pageProps} />
        </ErrorBoundary>
      </ThemeProvider>
    </CacheProvider>
    {globalStyles}
  </Suspense>
);

const AppWithTypeSystemContextProvider: FunctionComponent<AppProps> = (
  props,
) => {
  const {
    router: { pathname },
  } = props;

  return (
    <ApolloProvider client={apolloClient}>
      <AuthInfoProvider>
        <ClientRouteGuard>
          {pathname === PETRINAUT_EMBED_PATHNAME ? (
            <PetrinautEmbedAppShell {...props} />
          ) : (
            <App {...props} />
          )}
        </ClientRouteGuard>
      </AuthInfoProvider>
    </ApolloProvider>
  );
};

export default AppWithTypeSystemContextProvider;
