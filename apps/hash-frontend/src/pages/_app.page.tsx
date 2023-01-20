/* eslint-disable import/first */
// @todo have webpack polyfill this
require("setimmediate");

import "./globals.scss";

import { ApolloProvider } from "@apollo/client/react";
import { TypeSystemInitializer } from "@blockprotocol/type-system";
import wasm from "@blockprotocol/type-system/type-system.wasm";
import { CacheProvider, EmotionCache } from "@emotion/react";
import { Subgraph, SubgraphRootTypes } from "@hashintel/hash-subgraph";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import { createEmotionCache, theme } from "@local/design-system";
import { CssBaseline, GlobalStyles, ThemeProvider } from "@mui/material";
import { configureScope } from "@sentry/nextjs";
import { AppProps as NextAppProps } from "next/app";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { SnackbarProvider } from "notistack";
import {
  FunctionComponent,
  PropsWithChildren,
  Suspense,
  useEffect,
  useState,
} from "react";
import { ModalProvider } from "react-modal-hook";

import { MeQuery } from "../graphql/api-types.gen";
import { meQuery } from "../graphql/queries/user.queries";
import { apolloClient } from "../lib/apollo-client";
import {
  AuthenticatedUser,
  constructAuthenticatedUser,
} from "../lib/user-and-org";
import { EntityTypesContextProvider } from "../shared/entity-types-context/provider";
import { getPlainLayout, NextPageWithLayout } from "../shared/layout";
import {
  RoutePageInfoProvider,
  RouteWorkspaceInfoProvider,
} from "../shared/routing";
import { AppPage, redirectInGetInitialProps } from "./shared/_app.util";
import { AuthInfoProvider, useAuthInfo } from "./shared/auth-info-context";
import { fetchKratosSession } from "./shared/ory-kratos";
import { setSentryUser } from "./shared/sentry";
import { WorkspaceContextProvider } from "./shared/workspace-context";

// eslint-disable-next-line react/jsx-no-useless-fragment
const RenderChildren = ({ children }: PropsWithChildren) => <>{children}</>;

export const initWasm = async () => {
  let wasmModule;
  if (typeof window === "undefined") {
    // eslint-disable-next-line unicorn/prefer-node-protocol
    const { default: fs } = await import("fs/promises");

    // @ts-expect-error -- We need Node's native require here, and it's safe as this is a server-only block
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const wasmPath = __non_webpack_require__.resolve(
      "@blockprotocol/type-system/type-system.wasm",
    );
    const contents = await fs.readFile(wasmPath);

    wasmModule = await WebAssembly.compile(contents);
  } else {
    wasmModule = wasm;
  }
  await TypeSystemInitializer.initialize(wasmModule);
};

const InitTypeSystem = dynamic(
  async () => {
    await initWasm();

    return { default: RenderChildren };
  },
  {
    suspense: true,
  },
);

const clientSideEmotionCache = createEmotionCache();

type AppInitialProps = {
  initialAuthenticatedUser?: AuthenticatedUser;
};

type AppProps = {
  emotionCache?: EmotionCache;
  Component: NextPageWithLayout;
} & AppInitialProps &
  NextAppProps;

const App: FunctionComponent<AppProps> = ({
  Component,
  pageProps,
  emotionCache = clientSideEmotionCache,
}) => {
  // Helps prevent tree mismatch between server and client on initial render
  const [ssr, setSsr] = useState(true);
  const router = useRouter();

  useEffect(() => {
    configureScope((scope) =>
      // eslint-disable-next-line no-console -- TODO: consider using logger
      console.log(`Build: ${scope.getSession()?.release ?? "not set"}`),
    );
    setSsr(false);
  }, []);

  const { authenticatedUser } = useAuthInfo();

  useEffect(() => {
    setSentryUser({ authenticatedUser });
  }, [authenticatedUser]);

  // App UI often depends on [shortname] and other query params. However,
  // router.query is empty during server-side rendering for pages that don’t use
  // getServerSideProps. By showing app skeleton on the server, we avoid UI
  // mismatches during rehydration and improve type-safety of param extraction.
  if (ssr || !router.isReady) {
    return (
      <Suspense>
        <InitTypeSystem />
      </Suspense>
    ); // Replace with app skeleton
  }

  const getLayout = Component.getLayout ?? getPlainLayout;

  return (
    <Suspense>
      <InitTypeSystem>
        <CacheProvider value={emotionCache}>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <ModalProvider>
              <RouteWorkspaceInfoProvider>
                <RoutePageInfoProvider>
                  <WorkspaceContextProvider>
                    <SnackbarProvider maxSnack={3}>
                      <EntityTypesContextProvider>
                        {getLayout(<Component {...pageProps} />)}
                      </EntityTypesContextProvider>
                    </SnackbarProvider>
                  </WorkspaceContextProvider>
                </RoutePageInfoProvider>
              </RouteWorkspaceInfoProvider>
            </ModalProvider>
          </ThemeProvider>
        </CacheProvider>
        {/* "spin" is used in some inline styles which have been temporarily introduced in https://github.com/hashintel/hash/pull/1471 */}
        {/* @todo remove when inline styles are replaced with MUI styles */}
        <GlobalStyles
          styles={`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        };
      `}
        />
      </InitTypeSystem>
    </Suspense>
  );
};

const AppWithTypeSystemContextProvider: AppPage<AppProps, AppInitialProps> = (
  props,
) => {
  const { initialAuthenticatedUser } = props;

  return (
    <ApolloProvider client={apolloClient}>
      <AuthInfoProvider initialAuthenticatedUser={initialAuthenticatedUser}>
        <App {...props} />
      </AuthInfoProvider>
    </ApolloProvider>
  );
};

// The list of page pathnames that should be accessible whether or not the user is authenticated
const publiclyAccessiblePagePathnames = [
  "/[shortname]/[page-slug]",
  "/login",
  "/signup",
  "/recovery",
];

AppWithTypeSystemContextProvider.getInitialProps = async (appContext) => {
  const {
    ctx: { req, pathname },
  } = appContext;

  const { cookie } = req?.headers ?? {};

  const [subgraph, kratosSession] = await Promise.all([
    apolloClient
      .query<MeQuery>({
        query: meQuery,
        context: { headers: { cookie } },
      })
      .then(({ data }) => data.me)
      .catch(() => undefined),
    fetchKratosSession(cookie),
  ]);

  /** @todo: make additional pages publicly accessible */
  if (!subgraph || !kratosSession) {
    // If the user is logged out and not on a page that should be publicly accessible...
    if (!publiclyAccessiblePagePathnames.includes(pathname)) {
      // ...redirect them to the login page
      redirectInGetInitialProps({ appContext, location: "/login" });
    }

    return {};
  }

  const userEntity = getRoots(
    subgraph as Subgraph<SubgraphRootTypes["entity"]>,
  )[0]!;

  // The type system package needs to be initialized before calling `constructAuthenticatedUser`
  await TypeSystemInitializer.initialize();

  const initialAuthenticatedUser = constructAuthenticatedUser({
    userEntity,
    subgraph,
    kratosSession,
  });

  // If the user is logged in but hasn't completed signup and isn't on the signup page...
  if (
    !initialAuthenticatedUser.accountSignupComplete &&
    !pathname.startsWith("/signup")
  ) {
    // ...then redirect them to the signup page.
    redirectInGetInitialProps({ appContext, location: "/signup" });
  }

  return { initialAuthenticatedUser };
};

export default AppWithTypeSystemContextProvider;
