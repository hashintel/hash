import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client";

import possibleTypes from "./fragmentTypes.gen.json";

// @todo update references
export const createApolloClient = (name?: string) => {
  const ponyfilledFetch =
    typeof (globalThis as any).fetch === "undefined"
      ? require("node-fetch")
      : (globalThis as any).fetch;

  const httpLink = new HttpLink({
    uri: "http://localhost:5001/graphql",
    fetch: ponyfilledFetch,
  });

  return new ApolloClient({
    cache: new InMemoryCache({ possibleTypes: possibleTypes.possibleTypes }),
    credentials: "include",
    link: httpLink,
    name,
  });
};
