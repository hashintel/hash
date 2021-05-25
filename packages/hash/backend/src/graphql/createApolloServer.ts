import { ApolloServer } from "apollo-server-express";

import { schema } from "./typeDefs";
import { resolvers } from "./resolvers";

export const createApolloServer = () => {
  return new ApolloServer({
    typeDefs: schema,
    resolvers,
  });
};
