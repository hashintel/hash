import { ApolloServer } from "apollo-server-express";
import { Logger } from "winston";

import { schema } from "./typeDefs";
import { resolvers } from "./resolvers";
import { DBAdapter } from "../db";

export const createApolloServer = (db: DBAdapter, logger: Logger) => {
  return new ApolloServer({
    typeDefs: schema,
    resolvers,
    dataSources: () => ({
      db: db,
    }),
    context: (ctx) => ({
      logger: logger.child({ requestId: ctx.res.get("x-hash-request-id") }),
    }),
    plugins: [
      {
        requestDidStart: (ctx) => {
          ctx.logger = ctx.context.logger as Logger;
          return {
            willSendResponse: async (ctx) => {
              if (ctx.operationName === "IntrospectionQuery") {
                // Ignore introspection queries from graphiql
                return;
              }
              const msg = { message: "graphql", operation: ctx.operationName };
              if (ctx.errors) {
                ctx.logger.error({ ...msg, errors: ctx.errors });
              } else {
                ctx.logger.info(msg);
              }
            },
          };
        },
      },
    ],
  });
};
