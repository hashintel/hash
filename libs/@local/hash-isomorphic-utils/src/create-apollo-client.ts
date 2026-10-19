import {
  ApolloClient,
  ApolloLink,
  CombinedGraphQLErrors,
  HttpLink,
  InMemoryCache,
} from "@apollo/client";
import { ErrorLink } from "@apollo/client/link/error";
import * as Sentry from "@sentry/browser";

import { apiGraphQLEndpoint } from "./environment.js";
import possibleTypes from "./graphql/fragment-types.gen.json" with { type: "json" };
import { hashClientHeaderKey } from "./http-requests.js";

/**
 * The server-side client sets `errorPolicy` defaults that the browser client
 * does not, so both the default and the server's value are allowed here.
 */
/* eslint-disable @typescript-eslint/no-namespace, @typescript-eslint/no-shadow -- Apollo Client declares its default options as namespaced interfaces, which only namespace merging can extend */
declare module "@apollo/client" {
  namespace ApolloClient {
    namespace DeclareDefaultOptions {
      interface WatchQuery {
        errorPolicy?: "none" | "ignore";
      }
      interface Query {
        errorPolicy?: "none" | "all";
      }
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace, @typescript-eslint/no-shadow */

const errorLink = new ErrorLink(({ error, operation }) => {
  if (CombinedGraphQLErrors.is(error)) {
    for (const { message, extensions, path } of error.errors) {
      Sentry.withScope((scope) => {
        if (extensions?.code === "FORBIDDEN") {
          return;
        }

        const sentryError = new Error(
          `GraphQL Error: ${path?.[0]?.toString() ?? "?"}`,
        );
        scope.setExtra("Exception", extensions?.exception);
        scope.setExtra("Location", path);
        scope.setExtra("Query", operation.query.loc?.source.body);
        scope.setExtra(
          "Variables",
          JSON.stringify(operation.variables, undefined, 2),
        );
        sentryError.message = `GraphQL error - ${
          path?.[0]?.toString() ?? "undefined"
        } - ${message}`;
        Sentry.captureException(sentryError);
      });
    }
  }
});

export const createApolloClient = (params?: {
  clientId?: "web-app";
  name?: string;
  isBrowser: boolean;
  additionalHeaders?: { [key: string]: string };
}): ApolloClient => {
  /**
   * This wraps fetch to inject the query operation name into the URL, which makes it easier
   * to identify in dev tools.
   *
   * @todo disable this in production due to caching concerns
   */
  const wrappedFetch = (
    uri: string | Request,
    options: RequestInit | undefined,
  ) => {
    let operationName: string | null = null;

    if (typeof options?.body === "string") {
      try {
        ({ operationName } = JSON.parse(options.body));
      } catch (err) {
        // eslint-disable-next-line no-console -- TODO: consider using logger
        console.error(err);
      }
    }

    return fetch(
      operationName
        ? `${
            typeof uri === "string" ? uri : JSON.stringify(uri)
          }?${operationName}`
        : uri,
      options,
    );
  };

  let headers = params?.additionalHeaders;
  if (params?.clientId) {
    headers ??= {};
    headers[hashClientHeaderKey] = params.clientId;
  }

  const httpLink = new HttpLink({
    uri: apiGraphQLEndpoint,
    credentials: "include",
    fetch: wrappedFetch as WindowOrWorkerGlobalScope["fetch"],
    headers,
  });

  const link = ApolloLink.from([errorLink, httpLink]);

  const entityKeyFields = { keyFields: ["entityId"] };

  // Refetches and polls leave `loading` false, so components that render a
  // loading state while `loading` is true do not flash on every poll.
  const notifyOnNetworkStatusChange = false;

  // When the client is running in the browser, we want to use the cache
  // otherwise we want to disable the cache on the server to prevent sharing user data.
  const defaultOptions: ApolloClient.DefaultOptions = params?.isBrowser
    ? { watchQuery: { notifyOnNetworkStatusChange } }
    : {
        watchQuery: {
          fetchPolicy: "no-cache",
          errorPolicy: "ignore",
          notifyOnNetworkStatusChange,
        },
        query: {
          fetchPolicy: "no-cache",
          errorPolicy: "all",
        },
      };

  return new ApolloClient({
    // Apollo's query deduplication collapses in-flight queries with the
    // same (query, variables) into a single network request, ignoring
    // `context` (which carries per-request auth cookies). On the server
    // this singleton is shared across concurrent SSR requests, so two
    // users' identical queries get deduplicated and one receives the
    // other's authenticated data. Safe in the browser (single user).
    queryDeduplication: params?.isBrowser ?? false,
    cache: new InMemoryCache({
      possibleTypes: possibleTypes.possibleTypes,
      typePolicies: {
        UnknownEntity: entityKeyFields,
        PageProperties: { keyFields: ["pageEntityId"] },
        FlowRun: { keyFields: ["flowRunId"] },
      },
    }),
    devtools: {
      enabled:
        process.env.NEXT_PUBLIC_VERCEL_ENV === "development" ||
        process.env.NODE_ENV === "development",
    },
    link,
    clientAwareness: { name: params?.name },
    defaultOptions,
  });
};
