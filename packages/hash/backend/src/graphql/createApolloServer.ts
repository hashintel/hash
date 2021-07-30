import { ApolloServer, defaultPlaygroundOptions } from "apollo-server-express";
import { Logger } from "winston";

import { schema } from "./typeDefs";
import { resolvers } from "./resolvers";
import { DBAdapter } from "../db";
import { buildPassportGraphQLMethods } from "../auth/passport";
import { GraphQLContext } from "./context";

export const createApolloServer = (db: DBAdapter, logger: Logger) => {
  return new ApolloServer({
    typeDefs: schema,
    resolvers,
    dataSources: () => ({ db }),
    context: (ctx): Omit<GraphQLContext, "dataSources"> => ({
      ...ctx,
      user: ctx.req.user,
      passport: buildPassportGraphQLMethods(ctx),
      logger: logger.child({ requestId: ctx.res.get("x-hash-request-id") }),
    }),
    debug: true, // required for stack traces to be captured
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
                const stack = ctx.errors.map((err) => err.stack);
                ctx.logger.error({ ...msg, errors: ctx.errors, stack });
              } else {
                ctx.logger.info(msg);
              }
            },
          };
        },
      },
    ],
    playground: {
      ...defaultPlaygroundOptions,
      settings: {
        ...defaultPlaygroundOptions.settings,
        "request.credentials": "include",
      },
    },
  });
};
