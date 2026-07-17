import "./_app.page/why-did-you-render";

// @todo have webpack polyfill this
// @todo: https://linear.app/hash/issue/H-3769/investigate-new-eslint-errors
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("setimmediate");

// React Grid Layout CSS for dashboard drag-and-drop
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import "./globals.scss";
import "./prism.css";
import "./ds-components-styles.gen.css";
import { ApolloProvider } from "@apollo/client/react";
import { CacheProvider } from "@emotion/react";
import { CssBaseline, GlobalStyles, ThemeProvider } from "@mui/material";
import { ErrorBoundary, getClient } from "@sentry/nextjs";
import { useRouter } from "next/router";
import { SnackbarProvider } from "notistack";
import { Suspense, useEffect, useState } from "react";

import { getRoots } from "@blockprotocol/graph/stdlib";
import { createEmotionCache, theme } from "@hashintel/design-system/theme";
import { featureFlags } from "@local/hash-isomorphic-utils/feature-flags";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import { normalizeEmail } from "@local/hash-isomorphic-utils/normalize";

import { getHashInstanceSettings } from "../graphql/queries/knowledge/hash-instance.queries";
import { hasAccessToHashQuery, meQuery } from "../graphql/queries/user.queries";
import { apolloClient } from "../lib/apollo-client";
import { constructMinimalUser } from "../lib/user-and-org";
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
import { ErrorFallback } from "./_app.page/error-fallback";
import { reportIframeReactError } from "./processes/shared/iframe-error-reporter";
import { redirectInGetInitialProps } from "./shared/_app.util";
import { AuthInfoProvider, useAuthInfo } from "./shared/auth-info-context";
import { DataTypesContextProvider } from "./shared/data-types-context";
import { maintenanceRoute } from "./shared/maintenance";
import { type IdentityTraits, oryKratosClient } from "./shared/ory-kratos";
import { setSentryUser } from "./shared/sentry";
import { SlideStackProvider } from "./shared/slide-stack";
import { WorkspaceContextProvider } from "./shared/workspace-context";

import type {
  GetHashInstanceSettingsQueryQuery,
  HasAccessToHashQuery,
  MeQuery,
} from "../graphql/api-types.gen";
import type { MinimalUser } from "../lib/user-and-org";
import type { NextPageWithLayout } from "../shared/layout";
import type { AppPage } from "./shared/_app.util";
import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import type { EmotionCache } from "@emotion/react";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { FeatureFlag } from "@local/hash-isomorphic-utils/feature-flags";
import type { User } from "@local/hash-isomorphic-utils/system-types/user";
import type { AppProps as NextAppProps } from "next/app";
import type { FunctionComponent } from "react";

const clientSideEmotionCache = createEmotionCache();

type AppInitialProps = {
  initialAuthenticatedUserSubgraph?: Subgraph<EntityRootType<HashEntity>>;
  user?: MinimalUser;
  redirectTo?: string;
};

type AppProps = {
  emotionCache?: EmotionCache;
  Component: NextPageWithLayout;
} & AppInitialProps &
  NextAppProps;

const unverifiedUserPermittedPagePathnames = ["/verification", "/signup"];

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
  redirectTo,
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

  const { aal2Required, authenticatedUser, emailVerificationStatusKnown } =
    useAuthInfo();

  const awaitingEmailVerificationStatus =
    !!authenticatedUser && !emailVerificationStatusKnown && !aal2Required;

  /**
   * A `redirectTo` that points at the page we're already on is a no-op we must
   * ignore. `getInitialProps` re-runs on every navigation — including the
   * same-URL `router.replace`s this effect performs — and `useRouter()` returns
   * a fresh object each time, so honouring such a redirect spins forever in a
   * `replace` -> `getInitialProps` -> `replace` loop (e.g. landing on `/` after
   * accepting an org invite, where a stale `redirectTo: "/"` kept re-firing).
   */
  const pendingRedirect =
    !!redirectTo && redirectTo !== router.asPath ? redirectTo : undefined;

  /**
   * Handle client-side redirects that were determined in getInitialProps.
   * On the server these are HTTP 307s; on the client getInitialProps returns
   * a `redirectTo` prop instead, and this effect performs the navigation after
   * the current route transition completes (avoiding NProgress stalls).
   */
  useEffect(() => {
    if (pendingRedirect) {
      void router.replace(pendingRedirect);
    }
  }, [pendingRedirect, router]);

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
  // We also gate on a pending redirect so the page doesn't flash before
  // navigating. A `redirectTo` matching the current path isn't pending (see
  // `pendingRedirect`), so we render rather than stall on the loading state.
  if (
    ssr ||
    !router.isReady ||
    awaitingEmailVerificationStatus ||
    pendingRedirect
  ) {
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

const AppWithTypeSystemContextProvider: AppPage<AppProps, AppInitialProps> = (
  props,
) => {
  const {
    initialAuthenticatedUserSubgraph,
    user,
    router: { pathname },
  } = props;

  if (pathname === PETRINAUT_EMBED_PATHNAME) {
    return <PetrinautEmbedAppShell {...props} />;
  }

  return (
    <ApolloProvider client={apolloClient}>
      <AuthInfoProvider
        initialAuthenticatedUserSubgraph={initialAuthenticatedUserSubgraph}
        key={user?.accountId}
      >
        <App {...props} />
      </AuthInfoProvider>
    </ApolloProvider>
  );
};

// The list of page pathnames that should be accessible whether or not the user is authenticated
const publiclyAccessiblePagePathnames = [
  "/[shortname]/[page-slug]",
  "/signin",
  "/signup",
  "/verification",
  "/recovery",
  "/",
];

const redirectIfAuthenticatedPathnames = ["/signup"];

const getPrimaryEmailVerificationStatus = async (cookie?: string) =>
  oryKratosClient
    .toSession({ cookie })
    .then(({ data }) => {
      const identity = data.identity;

      if (!identity) {
        return undefined;
      }

      const identityTraits = identity.traits as IdentityTraits;
      const primaryEmailAddress = identityTraits.emails[0];

      if (!primaryEmailAddress) {
        return false;
      }

      const normalizedPrimaryEmail = normalizeEmail(primaryEmailAddress);

      return (
        identity.verifiable_addresses?.find(
          ({ value }) => normalizeEmail(value) === normalizedPrimaryEmail,
        )?.verified === true
      );
    })
    .catch(() => undefined);

/**
 * A map from a feature flag, to the list of pages which should not be accessible
 * if that feature flag is not enabled for the user.
 */
const featureFlagHiddenPathnames: Record<FeatureFlag, string[]> = {
  pages: [],
  documents: [],
  canvases: [],
  notes: ["/notes"],
  workers: ["/goals", "/flows", "/workers", "/agents"],
  ai: ["/goals"],
  supplyChain: [],
  dashboards: ["/dashboards", "/dashboard/[dashboard-id]"],
};

AppWithTypeSystemContextProvider.getInitialProps = async (appContext) => {
  const {
    ctx: { req, pathname, asPath },
  } = appContext;

  if (pathname === maintenanceRoute) {
    return {};
  }

  const { cookie } = req?.headers ?? {};

  /**
   * Fetch the authenticated user on the very first page load so it's available in the frontend.
   * We leave it up to the client to re-fetch the user as necessary in response to user-initiated actions.
   *
   * @todo this is running on every page transition — the response should
   *   be cacheable so it doesn't hit the backend on every navigation.
   *   Note: the server-side `apolloClient` singleton has
   *   `queryDeduplication: false` (see `create-apollo-client.ts`) because
   *   Apollo's dedup key ignores `context` and would otherwise leak one
   *   user's data into another concurrent SSR request.
   */
  const initialAuthenticatedUserSubgraph = await apolloClient
    .query<MeQuery>({
      query: meQuery,
      context: { headers: { cookie } },
    })
    .then(({ data }) =>
      mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType<HashEntity<User>>>(
        data.me.subgraph,
      ),
    )
    .catch(() => undefined);

  const userEntity = initialAuthenticatedUserSubgraph
    ? getRoots(initialAuthenticatedUserSubgraph)[0]
    : undefined;

  if (pathname === PETRINAUT_EMBED_PATHNAME) {
    if (userEntity) {
      /**
       * Don't inject user data into the Petrinaut embed route.
       */
      return {};
    }
    return {
      redirectTo: redirectInGetInitialProps({
        appContext,
        location: `/signin?return_to=${req?.url ?? asPath}`,
      }),
    };
  }

  /** @todo: make additional pages publicly accessible */
  if (!userEntity) {
    let redirectTo: string | undefined;

    // If the user is logged out and not on a page that should be publicly accessible...
    if (!publiclyAccessiblePagePathnames.includes(pathname)) {
      // ...redirect them to the sign in page
      redirectTo = redirectInGetInitialProps({
        appContext,
        location: `/signin${
          ["", "/", "/404"].includes(pathname)
            ? ""
            : `?return_to=${req?.url ?? asPath}`
        }`,
      });
    }

    return { redirectTo };
  }

  const user = constructMinimalUser({ userEntity });

  const primaryEmailVerified = await getPrimaryEmailVerificationStatus(cookie);

  if (primaryEmailVerified === false) {
    let redirectTo: string | undefined;

    if (!unverifiedUserPermittedPagePathnames.includes(pathname)) {
      redirectTo = redirectInGetInitialProps({
        appContext,
        location: "/verification",
      });
    }

    return { initialAuthenticatedUserSubgraph, user, redirectTo };
  }

  if (primaryEmailVerified === true && pathname === "/verification") {
    const redirectTo = redirectInGetInitialProps({
      appContext,
      location: "/",
    });
    return { initialAuthenticatedUserSubgraph, user, redirectTo };
  }

  let redirectTo: string | undefined;

  // If the user is logged in but hasn't completed signup...
  if (!user.accountSignupComplete) {
    const hasAccessToHash = await apolloClient
      .query<HasAccessToHashQuery>({
        query: hasAccessToHashQuery,
        context: { headers: { cookie } },
      })
      .then(({ data }) => data.hasAccessToHash);

    // ...if they have access to HASH but aren't on the signup page...
    if (hasAccessToHash && !pathname.startsWith("/signup")) {
      // ...then redirect them to the signup page.
      redirectTo = redirectInGetInitialProps({
        appContext,
        location: "/signup",
      });
      // ...if they don't have access to HASH but aren't on the home page...
    } else if (!hasAccessToHash && pathname !== "/") {
      // ...then redirect them to the home page.
      redirectTo = redirectInGetInitialProps({
        appContext,
        location: "/",
      });
    }
  } else if (
    redirectIfAuthenticatedPathnames.includes(pathname) &&
    !(pathname === "/signup" && (asPath ?? "").includes("invitationId="))
  ) {
    /**
     * If the user has completed signup and is on a page they shouldn't be on
     * (e.g. /signup), then redirect them to the home page.
     */
    redirectTo = redirectInGetInitialProps({
      appContext,
      location: "/",
    });
  }

  // For each feature flag...
  if (!redirectTo) {
    for (const featureFlag of featureFlags) {
      /**
       * ...if the user has not enabled the feature flag,
       * and the page is a hidden pathname for that feature flag...
       */
      if (
        !user.enabledFeatureFlags.includes(featureFlag) &&
        featureFlagHiddenPathnames[featureFlag].includes(pathname)
      ) {
        const isUserAdmin = await apolloClient
          .query<GetHashInstanceSettingsQueryQuery>({
            query: getHashInstanceSettings,
            context: { headers: { cookie } },
          })
          .then(({ data }) => !!data.hashInstanceSettings?.isUserAdmin);

        if (!isUserAdmin) {
          // ...then redirect them to the home page instead.
          redirectTo = redirectInGetInitialProps({
            appContext,
            location: "/",
          });
          break;
        }
      }
    }
  }

  return { initialAuthenticatedUserSubgraph, user, redirectTo };
};

export default AppWithTypeSystemContextProvider;
