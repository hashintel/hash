import { ApolloClient, InMemoryCache } from "@apollo/client";

import { possibleTypes } from "./fragmentTypes.gen.json";

export const createApolloClient = () =>
  new ApolloClient({
    uri: "http://localhost:5001/graphql",
    cache: new InMemoryCache({ possibleTypes }),
    credentials: "include",
  });
