import { performance } from "perf_hooks";

import {
  ApolloServer,
  defaultPlaygroundOptions,
  makeExecutableSchema,
} from "apollo-server-express";
import { StatsD } from "hot-shots";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import { schema } from "./typeDefs";
import { resolvers } from "./resolvers";
import { DBAdapter } from "../db";
import { CacheAdapter } from "../cache";
import { buildPassportGraphQLMethods } from "../auth/passport";
import { GraphQLContext } from "./context";
import EmailTransporter from "../email/transporter";

export const createApolloServer = (
  db: DBAdapter,
  cache: CacheAdapter,
  emailTransporter: EmailTransporter,
  logger: Logger,
  statsd?: StatsD
) => {
  // go via makeExecutableSchema to set inheritResolversFromInterfaces
  const combinedSchema = makeExecutableSchema({
    typeDefs: schema,
    resolvers,
    inheritResolversFromInterfaces: true,
  });

  return new ApolloServer({
    schema: combinedSchema,
    dataSources: () => ({ db, cache }),
    context: (ctx): Omit<GraphQLContext, "dataSources"> => ({
      ...ctx,
      user: ctx.req.user,
      emailTransporter,
      passport: buildPassportGraphQLMethods(ctx),
      logger: logger.child({ requestId: ctx.res.get("x-hash-request-id") }),
    }),
    debug: true, // required for stack traces to be captured
    plugins: [
      {
        requestDidStart: (ctx) => {
          ctx.logger = ctx.context.logger as Logger;
          const startedAt = performance.now();
          return {
            didResolveOperation: (didResolveOperationCtx) => {
              if (didResolveOperationCtx.operationName) {
                statsd?.increment(didResolveOperationCtx.operationName, [
                  "graphql",
                ]);
              }
            },

            willSendResponse: async (willSendResponseCtx) => {
              if (willSendResponseCtx.operationName === "IntrospectionQuery") {
                // Ignore introspection queries from graphiql
                return;
              }
              const msg = {
                message: "graphql",
                operation: willSendResponseCtx.operationName,
              };
              if (willSendResponseCtx.errors) {
                const stack = willSendResponseCtx.errors.map(
                  (err) => err.stack
                );
                willSendResponseCtx.logger.error({
                  ...msg,
                  errors: willSendResponseCtx.errors,
                  stack,
                });
              } else {
                willSendResponseCtx.logger.info(msg);
                if (willSendResponseCtx.operationName) {
                  const elapsed = performance.now() - startedAt;
                  statsd?.timing(
                    willSendResponseCtx.operationName,
                    elapsed,
                    1,
                    ["graphql"]
                  );
                }
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
