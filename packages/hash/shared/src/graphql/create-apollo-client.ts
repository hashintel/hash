import {
  ApolloClient,
  ApolloLink,
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

import { apiGraphQLEndpoint } from "../environment";
import possibleTypes from "./fragment-types.gen.json";

const errorLink = onError(({ graphQLErrors, operation }) => {
  if (graphQLErrors) {
    for (const { message, extensions, path } of graphQLErrors) {
      Sentry.withScope((scope) => {
        const error = new Error(
          `GraphQL Error: ${path?.[0]?.toString() ?? "?"}`,
        );
        scope.setExtra("Exception", extensions?.exception);
        scope.setExtra("Location", path);
        scope.setExtra("Query", operation.query.loc?.source.body);
        scope.setExtra("Variables", operation.variables);
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
  additionalHeaders?: { [key: string]: string | undefined };
}): ApolloClient<NormalizedCacheObject> => {
  const ponyfilledFetch =
    typeof (globalThis as any).fetch === "undefined"
      ? // eslint-disable-next-line global-require
        require("node-fetch")
      : (globalThis as any).fetch;

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
      operationName ? `${uri.toString()}?${operationName}` : uri,
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

  return new ApolloClient({
    cache: new InMemoryCache({
      possibleTypes: possibleTypes.possibleTypes,
      typePolicies: {
        UnknownEntity: entityKeyFields,
        Link: { keyFields: ["linkId"] },
        PageProperties: { keyFields: ["pageEntityId"] },
        Query: {
          fields: {
            accountPages: {
              merge: (_, incoming) => incoming,
            },
          },
        },
      },
    }),
    credentials: "include",
    link,
    name: params?.name,
  });
};
