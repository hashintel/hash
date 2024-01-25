import {
  ApolloClient,
  ApolloLink,
  DefaultOptions,
  HttpLink,
  InMemoryCache,
  NormalizedCacheObject,
} from "@apollo/client";
import { onError } from "@apollo/client/link/error";
import * as Sentry from "@sentry/browser";
import {
  RequestInfo as RequestInfoFromNodeFetch,
  RequestInit as RequestInitFromNodeFetch,
} from "node-fetch";

import { apiGraphQLEndpoint } from "./environment";
import possibleTypes from "./graphql/fragment-types.gen.json";

const errorLink = onError(({ graphQLErrors, operation }) => {
  if (graphQLErrors) {
    for (const { message, extensions, path } of graphQLErrors) {
      Sentry.withScope((scope) => {
        if (extensions.code === "FORBIDDEN") {
          return;
        }

        const error = new Error(
          `GraphQL Error: ${path?.[0]?.toString() ?? "?"}`,
        );
        scope.setExtra("Exception", extensions.exception);
        scope.setExtra("Location", path);
        scope.setExtra("Query", operation.query.loc?.source.body);
        scope.setExtra(
          "Variables",
          JSON.stringify(operation.variables, undefined, 2),
        );
        error.message = `GraphQL error - ${
          path?.[0]?.toString() ?? "undefined"
        } - ${message}`;
        Sentry.captureException(error);
      });
    }
  }
});

// @todo update references
export const createApolloClient = (params?: {
  name?: string;
  isBrowser: boolean;
  additionalHeaders?: { [key: string]: string | undefined };
}): ApolloClient<NormalizedCacheObject> => {
  const ponyfilledFetch =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    typeof (globalThis as any).fetch === "undefined"
      ? // eslint-disable-next-line global-require
        require("node-fetch")
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).fetch;

  /**
   * This wraps fetch to inject the query operation name into the URL, which makes it easier
   * to identify in dev tools.
   *
   * @todo disable this in production due to caching concerns
   */
  const wrappedFetch = (
    uri: RequestInfoFromNodeFetch | Request,
    options: RequestInitFromNodeFetch | RequestInit | undefined,
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

    return ponyfilledFetch(
      operationName
        ? `${typeof uri === "string" ? uri : JSON.stringify(uri)}?${operationName}`
        : uri,
      options,
    );
  };

  const httpLink = new HttpLink({
    uri: apiGraphQLEndpoint,
    credentials: "include",
    fetch: wrappedFetch,
    headers: params?.additionalHeaders,
  });

  const link = ApolloLink.from([errorLink, httpLink]);

  const entityKeyFields = { keyFields: ["entityId"] };

  // When the client is running in the browser, we want to use the cache
  // otherwise we want to disable the cache on the server to prevent sharing user data.
  const defaultOptions: DefaultOptions | undefined = params?.isBrowser
    ? undefined
    : {
        watchQuery: {
          fetchPolicy: "no-cache",
          errorPolicy: "ignore",
        },
        query: {
          fetchPolicy: "no-cache",
          errorPolicy: "all",
        },
      };

  return new ApolloClient({
    cache: new InMemoryCache({
      possibleTypes: possibleTypes.possibleTypes,
      typePolicies: {
        UnknownEntity: entityKeyFields,
        PageProperties: { keyFields: ["pageEntityId"] },
      },
    }),
    credentials: "include",
    link,
    name: params?.name,
    defaultOptions,
  });
};
