import {
  ApolloClient,
  ApolloLink,
  HttpLink,
  InMemoryCache,
  Observable,
} from "@apollo/client";
import { onError } from "@apollo/client/link/error";
import { RetryLink } from "@apollo/client/link/retry";
import * as Sentry from "@sentry/browser";

import { apiGraphQLEndpoint } from "./environment.js";
import possibleTypes from "./graphql/fragment-types.gen.json" with { type: "json" };
import { hashClientHeaderKey } from "./http-requests.js";

import type {
  DefaultOptions,
  FetchResult,
  NormalizedCacheObject,
  Operation,
} from "@apollo/client";

/**
 * Opts one operation into retries, through its `context`. Operations without
 * it are sent once, as before.
 */
export type RetryContext = {
  /**
   * How long each retry of a failed attempt waits, in order: one retry per
   * entry. An attempt fails when its request does or its answer has errors.
   */
  retryDelaysMs?: readonly number[];
};

const retryDelaysOf = (operation: Operation) =>
  (operation.getContext() as RetryContext).retryDelaysMs;

/** An answer with errors, failed so that the retry link retries it. */
class ResultWithErrors extends Error {
  constructor(readonly result: FetchResult) {
    super(
      result.errors?.map(({ message }) => message).join("; ") ??
        "The answer has errors",
    );
    this.name = "ResultWithErrors";
  }
}

/**
 * Retries the operations that opt in through {@link RetryContext}, after
 * each of their delays in turn. When retries are exhausted, GraphQL error
 * results are restored as normal {@link FetchResult}s so Apollo preserves
 * `graphQLErrors`, partial `data`, and `errorPolicy` instead of surfacing them
 * as network errors. Every other operation passes through untouched.
 */
const retryLink = ApolloLink.split(
  (operation) => retryDelaysOf(operation) !== undefined,
  ApolloLink.from([
    new ApolloLink(
      (operation, forward) =>
        new Observable((observer) =>
          forward(operation).subscribe({
            next: (result) => observer.next(result),
            complete: () => observer.complete(),
            error: (err) => {
              if (err instanceof ResultWithErrors) {
                observer.next(err.result);
                observer.complete();
              } else {
                observer.error(err);
              }
            },
          }),
        ),
    ),
    new RetryLink({
      delay: (count, operation) => retryDelaysOf(operation)?.[count - 1] ?? 0,
      attempts: (count, operation) =>
        count <= (retryDelaysOf(operation)?.length ?? 0),
    }),
    new ApolloLink((operation, forward) =>
      forward(operation).map((result) => {
        if (result.errors?.length) {
          throw new ResultWithErrors(result);
        }
        return result;
      }),
    ),
  ]),
);

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

export const createApolloClient = (params?: {
  clientId?: "web-app";
  name?: string;
  isBrowser: boolean;
  additionalHeaders?: { [key: string]: string };
}): ApolloClient<NormalizedCacheObject> => {
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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- false positive
    fetch: wrappedFetch as WindowOrWorkerGlobalScope["fetch"],
    headers,
  });

  // The error link reports each attempt's errors, after the retry link.
  const link = ApolloLink.from([retryLink, errorLink, httpLink]);

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
      process.env.NEXT_PUBLIC_VERCEL_ENV === "development" ||
      process.env.NODE_ENV === "development",
    credentials: "include",
    link,
    name: params?.name,
    defaultOptions,
  });
};
