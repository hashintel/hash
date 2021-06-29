import { ApolloServer } from "apollo-server-express";

import { schema } from "./typeDefs";
import { resolvers } from "./resolvers";
import { DBAdapter } from "../db";


export const createApolloServer = (db: DBAdapter) => {
  return new ApolloServer({
    typeDefs: schema,
    resolvers,
    dataSources: () => ({
      db: db,
    })
  });
};
