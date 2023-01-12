import { performance } from "node:perf_hooks";

import { makeExecutableSchema } from "@graphql-tools/schema";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { SearchAdapter } from "@hashintel/hash-backend-utils/search/adapter";
import { ApolloServerPluginLandingPageGraphQLPlayground } from "apollo-server-core";
import { ApolloServer } from "apollo-server-express";
import { StatsD } from "hot-shots";

import { CacheAdapter } from "../cache";
import { EmailTransporter } from "../email/transporters";
import { GraphApi } from "../graph";
import { UploadableStorageProvider } from "../storage";
import { TaskExecutor } from "../task-execution";
import { GraphQLContext } from "./context";
import { resolvers } from "./resolvers";
import { schema } from "./type-defs";

export interface CreateApolloServerParams {
  graphApi: GraphApi;
  cache: CacheAdapter;
  uploadProvider: UploadableStorageProvider;
  search?: SearchAdapter;
  taskExecutor?: TaskExecutor;
  emailTransporter: EmailTransporter;
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
      graphApi,
      cache,
      uploadProvider,
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
      user: ctx.req.user,
      emailTransporter,
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
      ApolloServerPluginLandingPageGraphQLPlayground({
        settings: { "request.credentials": "include" },
      }),
    ],
  });
};
