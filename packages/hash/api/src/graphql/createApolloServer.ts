import { performance } from "perf_hooks";

import {
  ApolloServer,
  defaultPlaygroundOptions,
  makeExecutableSchema,
} from "apollo-server-express";
import { StatsD } from "hot-shots";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { SearchAdapter } from "@hashintel/hash-backend-utils/search/adapter";

import { schema } from "./typeDefs";
import { resolvers } from "./resolvers";
import { DBAdapter } from "../db";
import { CacheAdapter } from "../cache";
import { buildPassportGraphQLMethods } from "../auth/passport";
import { GraphQLContext } from "./context";
import { EmailTransporter } from "../email/transporters";
import {
  StorageProviders,
  UploadableStorageProvider,
} from "../storage/storage-provider";

export interface CreateApolloServerParams {
  db: DBAdapter;
  cache: CacheAdapter;
  search: SearchAdapter;
  emailTransporter: EmailTransporter;
  /** All available storage providers to retrieve files from */
  storageProviders: StorageProviders;
  /** The storage provider to use for new file uploads */
  uploadProvider: UploadableStorageProvider;
  logger: Logger;
  statsd?: StatsD;
}
export const createApolloServer = ({
  db,
  cache,
  search,
  emailTransporter,
  storageProviders,
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

  return new ApolloServer({
    schema: combinedSchema,
    dataSources: () => ({ db, cache, search }),
    context: (ctx): Omit<GraphQLContext, "dataSources"> => ({
      ...ctx,
      user: ctx.req.user,
      emailTransporter,
      storageProviders,
      uploadProvider,
      passport: buildPassportGraphQLMethods(ctx),
      logger: logger.child({ requestId: ctx.res.get("x-hash-request-id") }),
    }),
    // @todo: we may want to disable introspection at some point for production
    introspection: true,
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
                  (err) => err.stack,
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
                    ["graphql"],
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
