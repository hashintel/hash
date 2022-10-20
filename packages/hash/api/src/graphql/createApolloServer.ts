import { performance } from "perf_hooks";

import {
  ApolloServerPluginLandingPageGraphQLPlayground,
  ApolloServerPluginLandingPageDisabled,
} from "apollo-server-core";
import { ApolloServer } from "apollo-server-express";
import { makeExecutableSchema } from "@graphql-tools/schema";

import { StatsD } from "hot-shots";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { SearchAdapter } from "@hashintel/hash-backend-utils/search/adapter";

import { schema } from "./typeDefs";
import { resolvers } from "./resolvers";
import { CacheAdapter } from "../cache";
import { GraphQLContext } from "./context";
import { EmailTransporter } from "../email/transporters";
import { StorageType } from "./apiTypes.gen";
import { TaskExecutor } from "../task-execution";
import { GraphApi } from "../graph";

export interface CreateApolloServerParams {
  graphApi: GraphApi;
  cache: CacheAdapter;
  search?: SearchAdapter;
  taskExecutor?: TaskExecutor;
  emailTransporter: EmailTransporter;
  /** The storage provider to use for new file uploads */
  uploadProvider: StorageType;
  logger: Logger;
  statsd?: StatsD;
}

export const createApolloServer = ({
  graphApi,
  cache,
  search,
  taskExecutor,
  emailTransporter,
  uploadProvider,
  logger,
  statsd,
}: CreateApolloServerParams) => {
  // go via makeExecutableSchema to set inheritResolversFromInterfaces
  const combinedSchema = makeExecutableSchema({
    typeDefs: schema,
    resolvers,
    inheritResolversFromInterfaces: true,
  });
  const getDataSources = () => {
    const sources: GraphQLContext["dataSources"] = {
      /** @todo: remove all db dependencies */
      db: {} as any,
      graphApi,
      cache,
    };
    if (search) {
      sources.search = search;
    }
    if (taskExecutor) {
      sources.taskExecutor = taskExecutor;
    }
    return sources;
  };

  return new ApolloServer({
    schema: combinedSchema,
    dataSources: getDataSources,
    context: (ctx): Omit<GraphQLContext, "dataSources"> => ({
      ...ctx,
      userModel: ctx.req.userModel,
      emailTransporter,
      uploadProvider,
      logger: logger.child({
        requestId: ctx.res.get("x-hash-request-id") ?? "",
      }),
    }),
    // @todo: we may want to disable introspection at some point for production
    introspection: true,
    debug: true, // required for stack traces to be captured
    plugins: [
      {
        requestDidStart: async (ctx) => {
          ctx.logger = ctx.context.logger as Logger;
          const startedAt = performance.now();
          return {
            didResolveOperation: async (didResolveOperationCtx) => {
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
                willSendResponseCtx.logger.error({
                  ...msg,
                  errors: willSendResponseCtx.errors,
                  stack: willSendResponseCtx.errors
                    .map((err) => err.stack)
                    // Filter stacks caused by an apollo Forbidden error to prevent cluttering logs
                    // with errors caused by a user being logged out.
                    .filter(
                      (stack) => stack && !stack.startsWith("ForbiddenError"),
                    ),
                });
              } else {
                willSendResponseCtx.logger.info(msg);
                if (willSendResponseCtx.operationName) {
                  const elapsed = performance.now() - startedAt;
                  statsd?.timing(
                    willSendResponseCtx.operationName,
                    elapsed,
                    1,
                    ["graphql"],
                  );
                }
              }
            },
          };
        },
      },
      process.env.NODE_ENV === "production"
        ? ApolloServerPluginLandingPageDisabled()
        : ApolloServerPluginLandingPageGraphQLPlayground({
            settings: { "request.credentials": "include" },
          }),
    ],
  });
};
