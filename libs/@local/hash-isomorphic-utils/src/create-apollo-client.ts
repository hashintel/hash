import {
  ApolloClient,
  ApolloLink,
  HttpLink,
  InMemoryCache,
} from "@apollo/client";
import { onError } from "@apollo/client/link/error";
import { captureException, withScope } from "@sentry/browser";

import { apiGraphQLEndpoint } from "./environment.js";
import possibleTypes from "./graphql/fragment-types.gen.json" with { type: "json" };
import { hashClientHeaderKey } from "./http-requests.js";

import type { DefaultOptions, NormalizedCacheObject } from "@apollo/client";

const errorLink = onError(({ graphQLErrors, operation }) => {
  if (graphQLErrors !== undefined) {
    for (const { message, extensions, path } of graphQLErrors) {
      withScope((scope) => {
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
        captureException(error);
      });
    }
  }
});

/**
 * Reads the GraphQL operation name from a serialized request body, if there is one.
 */
const getOperationName = (body: string): string | null => {
  try {
    // oxlint-disable-next-line typescript/no-restricted-types -- parsed JSON is of unknown shape until narrowed below
    const parsed: unknown = JSON.parse(body);

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "operationName" in parsed &&
      typeof parsed.operationName === "string" &&
      parsed.operationName !== ""
    ) {
      return parsed.operationName;
    }
  } catch (error) {
    // eslint-disable-next-line no-console -- TODO: consider using logger
    console.error(error);
  }

  return null;
};

/**
 * This wraps fetch to inject the query operation name into the URL, which makes it easier
 * to identify in dev tools.
 *
 * @todo disable this in production due to caching concerns
 */
const wrappedFetch = async (
  uri: string | Request | URL,
  options?: RequestInit,
): Promise<Response> => {
  let operationName: string | null = null;
  if (typeof options?.body === "string") {
    operationName = getOperationName(options.body);
  }

  if (operationName === null) {
    return fetch(uri, options);
  }

  if (typeof uri === "string") {
    return fetch(`${uri}?${operationName}`, options);
  }

  return fetch(`${JSON.stringify(uri)}?${operationName}`, options);
};

export const createApolloClient = (params?: {
  clientId?: "web-app";
  name?: string;
  isBrowser: boolean;
  additionalHeaders?: Record<string, string>;
}): ApolloClient<NormalizedCacheObject> => {
  let headers = params?.additionalHeaders;
  if (params?.clientId !== undefined) {
    headers ??= {};
    headers[hashClientHeaderKey] = params.clientId;
  }

  const httpLink = new HttpLink({
    uri: apiGraphQLEndpoint,
    credentials: "include",
    fetch: wrappedFetch,
    headers,
  });

  const link = ApolloLink.from([errorLink, httpLink]);

  const entityKeyFields = { keyFields: ["entityId"] };

  // When the client is running in the browser, we want to use the cache
  // otherwise we want to disable the cache on the server to prevent sharing user data.
  const defaultOptions: DefaultOptions | undefined =
    params?.isBrowser === true
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
        FlowRun: { keyFields: ["flowRunEntityId"] },
      },
    }),
    connectToDevTools:
      // oxlint-disable-next-line eslint/no-undef -- bundlers inline process.env.* at build time; `process` is not a browser global
      process.env.NEXT_PUBLIC_VERCEL_ENV === "development" ||
      // oxlint-disable-next-line eslint/no-undef -- bundlers inline process.env.* at build time; `process` is not a browser global
      process.env.NODE_ENV === "development",
    credentials: "include",
    link,
    name: params?.name,
    defaultOptions,
  });
};
