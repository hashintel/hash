import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client";
import { RequestInfo, RequestInit } from "node-fetch";

import possibleTypes from "./fragmentTypes.gen.json";

// @todo update references
export const createApolloClient = (
  name?: string,
  additionalHeaders?: { [key: string]: string | undefined }
) => {
  const ponyfilledFetch =
    typeof (globalThis as any).fetch === "undefined"
      ? require("node-fetch")
      : (globalThis as any).fetch;

  /**
   * This wraps fetch to inject the query operation name into the URL, which makes it easier
   * to identify in dev tools.
   *
   * @todo disable this in production due to caching concerns
   */
  const wrappedFetch = (uri: RequestInfo, options: RequestInit | undefined) => {
    let operationName: string | null = null;

    if (typeof options?.body === "string") {
      try {
        ({ operationName } = JSON.parse(options.body));
      } catch {}
    }

    return ponyfilledFetch(
      operationName ? `${uri}?${operationName}` : uri,
      options
    );
  };
  const httpLink = new HttpLink({
    uri: "http://localhost:5001/graphql",
    credentials: "include",
    fetch: wrappedFetch,
    headers: additionalHeaders,
  });

  return new ApolloClient({
    cache: new InMemoryCache({ possibleTypes: possibleTypes.possibleTypes }),
    credentials: "include",
    link: httpLink,
    name,
  });
};
