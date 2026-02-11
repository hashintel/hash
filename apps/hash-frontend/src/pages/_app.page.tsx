/* eslint-disable import/first */
import "./_app.page/why-did-you-render";

// @todo have webpack polyfill this
// @todo: https://linear.app/hash/issue/H-3769/investigate-new-eslint-errors
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("setimmediate");

import "./globals.scss";
import "./prism.css";

import { ApolloProvider } from "@apollo/client/react";
import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import { getRoots } from "@blockprotocol/graph/stdlib";
import type { EmotionCache } from "@emotion/react";
import { CacheProvider } from "@emotion/react";
import { createEmotionCache, theme } from "@hashintel/design-system/theme";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { FeatureFlag } from "@local/hash-isomorphic-utils/feature-flags";
import { featureFlags } from "@local/hash-isomorphic-utils/feature-flags";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import type { User } from "@local/hash-isomorphic-utils/system-types/user";
import { CssBaseline, GlobalStyles, ThemeProvider } from "@mui/material";
import { ErrorBoundary, getClient } from "@sentry/nextjs";
import type { AppProps as NextAppProps } from "next/app";
import { useRouter } from "next/router";
import { SnackbarProvider } from "notistack";
import type { FunctionComponent } from "react";
import { Suspense, useEffect, useState } from "react";

import type {
  GetHashInstanceSettingsQueryQuery,
  HasAccessToHashQuery,
  MeQuery,
} from "../graphql/api-types.gen";
import { getHashInstanceSettings } from "../graphql/queries/knowledge/hash-instance.queries";
import { hasAccessToHashQuery, meQuery } from "../graphql/queries/user.queries";
import { apolloClient } from "../lib/apollo-client";
import type { MinimalUser } from "../lib/user-and-org";
import { constructMinimalUser } from "../lib/user-and-org";
import { DraftEntitiesCountContextProvider } from "../shared/draft-entities-count-context";
import { EntityTypesContextProvider } from "../shared/entity-types-context/provider";
import { FileUploadsProvider } from "../shared/file-upload-context";
import { InvitesContextProvider } from "../shared/invites-context";
import { KeyboardShortcutsContextProvider } from "../shared/keyboard-shortcuts-context";
import type { NextPageWithLayout } from "../shared/layout";
import { getLayoutWithSidebar, getPlainLayout } from "../shared/layout";
import { SidebarContextProvider } from "../shared/layout/layout-with-sidebar/sidebar-context";
import { NotificationCountContextProvider } from "../shared/notification-count-context";
import { PropertyTypesContextProvider } from "../shared/property-types-context";
import { RoutePageInfoProvider } from "../shared/routing";
import { ErrorFallback } from "./_app.page/error-fallback";
import type { AppPage } from "./shared/_app.util";
import { redirectInGetInitialProps } from "./shared/_app.util";
import { AuthInfoProvider, useAuthInfo } from "./shared/auth-info-context";
import { DataTypesContextProvider } from "./shared/data-types-context";
import { maintenanceRoute } from "./shared/maintenance";
import { type IdentityTraits, oryKratosClient } from "./shared/ory-kratos";
import { setSentryUser } from "./shared/sentry";
import { SlideStackProvider } from "./shared/slide-stack";
import { WorkspaceContextProvider } from "./shared/workspace-context";

const clientSideEmotionCache = createEmotionCache();

type AppInitialProps = {
  initialAuthenticatedUserSubgraph?: Subgraph<EntityRootType<HashEntity>>;
  /** Set when getInitialProps determines a client-side redirect is needed. */
  redirectTo?: string;
  user?: MinimalUser;
};

type AppProps = {
  emotionCache?: EmotionCache;
  Component: NextPageWithLayout;
} & AppInitialProps &
  NextAppProps;

const unverifiedUserPermittedPagePathnames = ["/verification", "/signup"];

const App: FunctionComponent<AppProps & { redirectTo?: string }> = ({
  Component,
  pageProps,
  redirectTo,
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

  const { aal2Required, authenticatedUser, emailVerificationStatusKnown } =
    useAuthInfo();

  const primaryEmailVerified =
    authenticatedUser?.emails.find(({ primary }) => primary)?.verified ?? false;

  const userMustVerifyEmail =
    !!authenticatedUser &&
    emailVerificationStatusKnown &&
    !primaryEmailVerified;

  const awaitingEmailVerificationStatus =
    !!authenticatedUser && !emailVerificationStatusKnown && !aal2Required;

  /**
   * Handle client-side redirects determined by getInitialProps. These are
   * deferred to useEffect so they don't conflict with the in-progress route
   * transition (which would stall the NProgress bar).
   */
  useEffect(() => {
    if (redirectTo && router.isReady) {
      void router.replace(redirectTo);
    }
  }, [redirectTo, router]);

  useEffect(() => {
    if (
      !router.isReady ||
      !userMustVerifyEmail ||
      unverifiedUserPermittedPagePathnames.includes(router.pathname)
    ) {
      return;
    }

    void router.replace("/verification");
  }, [router, userMustVerifyEmail]);

  useEffect(() => {
    setSentryUser({ authenticatedUser });
  }, [authenticatedUser]);

  // App UI often depends on [shortname] and other query params. However,
  // router.query is empty during server-side rendering for pages that don’t use
  // getServerSideProps. By showing app skeleton on the server, we avoid UI
  // mismatches during rehydration and improve type-safety of param extraction.
  if (ssr || !router.isReady || awaitingEmailVerificationStatus) {
    return <Suspense />; // Replace with app skeleton
  }

  const getLayout = Component.getLayout ?? getPlainLayout;

  if (
    userMustVerifyEmail &&
    !unverifiedUserPermittedPagePathnames.includes(router.pathname)
  ) {
    return <Suspense />;
  }

  if (userMustVerifyEmail) {
    return (
      <Suspense>
        <CacheProvider value={emotionCache}>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <KeyboardShortcutsContextProvider>
              {getLayout(<Component {...pageProps} />)}
            </KeyboardShortcutsContextProvider>
          </ThemeProvider>
        </CacheProvider>
        <GlobalStyles
          styles={{
            "@keyframes mui-auto-fill": { from: { display: "block" } },
            "@keyframes mui-auto-fill-cancel": { from: { display: "block" } },
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
      </Suspense>
    );
  }

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
    </Suspense>
  );
};

const AppWithTypeSystemContextProvider: AppPage<AppProps, AppInitialProps> = (
  props,
) => {
  const { initialAuthenticatedUserSubgraph, redirectTo, user } = props;

  return (
    <ApolloProvider client={apolloClient}>
      <AuthInfoProvider
        initialAuthenticatedUserSubgraph={initialAuthenticatedUserSubgraph}
        key={user?.accountId}
      >
        <App {...props} redirectTo={redirectTo} />
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

      return (
        identity.verifiable_addresses?.find(
          ({ value }) => value === primaryEmailAddress,
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
   * @todo this is running on every page transition. make it stop or make caching work (need to create new client on request to avoid sharing user data)
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

  /**
   * Helper: on server-side, performs an HTTP 307 redirect. On client-side,
   * returns a redirectTo field so the component can handle it via useEffect
   * (avoids calling router.push during an active transition, which stalls NProgress).
   */
  const redirect = (location: string): AppInitialProps => {
    redirectInGetInitialProps({ appContext, location });
    return { redirectTo: req ? undefined : location };
  };

  /** @todo: make additional pages publicly accessible */
  if (!userEntity) {
    // If the user is logged out and not on a page that should be publicly accessible...
    if (!publiclyAccessiblePagePathnames.includes(pathname)) {
      // ...redirect them to the sign in page
      return redirect(
        `/signin${
          ["", "/", "/404"].includes(pathname)
            ? ""
            : `?return_to=${req?.url ?? asPath}`
        }`,
      );
    }

    return {};
  }

  const user = constructMinimalUser({ userEntity });

  const primaryEmailVerified = await getPrimaryEmailVerificationStatus(cookie);

  if (primaryEmailVerified === false) {
    if (!unverifiedUserPermittedPagePathnames.includes(pathname)) {
      return {
        initialAuthenticatedUserSubgraph,
        user,
        ...redirect("/verification"),
      };
    }

    return { initialAuthenticatedUserSubgraph, user };
  }

  if (primaryEmailVerified === true && pathname === "/verification") {
    return {
      initialAuthenticatedUserSubgraph,
      user,
      ...redirect("/"),
    };
  }

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
      return {
        initialAuthenticatedUserSubgraph,
        user,
        ...redirect("/signup"),
      };
      // ...if they don't have access to HASH but aren't on the home page...
    } else if (!hasAccessToHash && pathname !== "/") {
      // ...then redirect them to the home page.
      return {
        initialAuthenticatedUserSubgraph,
        user,
        ...redirect("/"),
      };
    }
  } else if (redirectIfAuthenticatedPathnames.includes(pathname)) {
    /**
     * If the user has completed signup and is on a page they shouldn't be on
     * (e.g. /signup), then redirect them to the home page.
     */
    return {
      initialAuthenticatedUserSubgraph,
      user,
      ...redirect("/"),
    };
  }

  // For each feature flag...
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
        return {
          initialAuthenticatedUserSubgraph,
          user,
          ...redirect("/"),
        };
      }
    }
  }

  return { initialAuthenticatedUserSubgraph, user };
};

export default AppWithTypeSystemContextProvider;
