import { ApolloServer } from "apollo-server-express";

import { schema } from "./typeDefs";
import { resolvers } from "./resolvers";

import { PostgresAdapter } from "../db";


export const createApolloServer = () => {
  return new ApolloServer({
    typeDefs: schema,
    resolvers,
    dataSources: () => ({
      db: new PostgresAdapter(),
    })
  });
};
