import { ApolloClient, InMemoryCache } from "@apollo/client";

export const createApolloClient = () =>
  new ApolloClient({
    uri: "http://localhost:5001/graphql",
    cache: new InMemoryCache(),
  });
