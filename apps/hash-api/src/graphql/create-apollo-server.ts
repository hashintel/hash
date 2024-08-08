import { performance } from "node:perf_hooks";

import { makeExecutableSchema } from "@graphql-tools/schema";
import type { UploadableStorageProvider } from "@local/hash-backend-utils/file-storage";
import type { Logger } from "@local/hash-backend-utils/logger";
import type { SearchAdapter } from "@local/hash-backend-utils/search/adapter";
import type { TemporalClient } from "@local/hash-backend-utils/temporal";
import type { VaultClient } from "@local/hash-backend-utils/vault";
import { schema } from "@local/hash-isomorphic-utils/graphql/type-defs/schema";
import { getHashClientTypeFromRequest } from "@local/hash-isomorphic-utils/http-requests";
import * as Sentry from "@sentry/node";
import { ApolloServerPluginLandingPageGraphQLPlayground } from "apollo-server-core";
import { ApolloServer } from "apollo-server-express";
import type { StatsD } from "hot-shots";

import { getActorIdFromRequest } from "../auth/get-actor-id";
import type { CacheAdapter } from "../cache";
import type { EmailTransporter } from "../email/transporters";
import type { GraphApi } from "../graph/context-types";
import type { GraphQLContext } from "./context";
import { resolvers } from "./resolvers";

export interface CreateApolloServerParams {
  graphApi: GraphApi;
  cache: CacheAdapter;
  uploadProvider: UploadableStorageProvider;
  temporalClient: TemporalClient;
  vaultClient?: VaultClient;
  search?: SearchAdapter;
  emailTransporter: EmailTransporter;
  logger: Logger;
  statsd?: StatsD;
}

export const createApolloServer = ({
  graphApi,
  cache,
  search,
  emailTransporter,
  uploadProvider,
  temporalClient,
  vaultClient,
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
    return sources;
  };

  return new ApolloServer({
    schema: combinedSchema,
    dataSources: getDataSources,
    context: (ctx): Omit<GraphQLContext, "dataSources"> => ({
      ...ctx,
      authentication: {
        actorId: getActorIdFromRequest(ctx.req),
      },
      provenance: {
        actorType: "human",
        origin: {
          type: getHashClientTypeFromRequest(ctx.req) ?? "api",
          userAgent: ctx.req.headers["user-agent"],
        },
      },
      user: ctx.req.user,
      emailTransporter,
      logger: logger.child({
        requestId: ctx.res.get("x-hash-request-id") ?? "",
      }),
      temporal: temporalClient,
      vault: vaultClient,
    }),
    // @todo: we may want to disable introspection at some point for production
    introspection: true,
    debug: true, // required for stack traces to be captured
    // See https://www.apollographql.com/docs/apollo-server/integrations/plugins/#request-lifecycle-event-flow
    plugins: [
      {
        requestDidStart: async (ctx) => {
          ctx.logger = ctx.context.logger as Logger;

          const startTimestamp = performance.now();

          return {
            didResolveOperation: async (didResolveOperationCtx) => {
              const operationName = didResolveOperationCtx.operationName;
              if (operationName) {
                statsd?.increment(operationName, ["graphql"]);
              }
            },

            executionDidStart: async ({ request }) => {
              const scope = Sentry.getCurrentScope();

              scope.setContext("graphql", {
                query: request.query,
                variables: request.variables,
              });
            },

            didEncounterErrors: async (errorContext) => {
              for (const err of errorContext.errors) {
                // Don't send ForbiddenErrors to Sentry – we can add more here as needed
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- this may be undefined
                if (err.extensions?.code === "FORBIDDEN") {
                  continue;
                }

                if (err.path) {
                  Sentry.getCurrentScope().addBreadcrumb({
                    category: "query-path",
                    message: err.path.join(" > "),
                  });
                }

                Sentry.captureException(err);
              }
            },

            willSendResponse: async (willSendResponseCtx) => {
              if (willSendResponseCtx.operationName === "IntrospectionQuery") {
                // Ignore introspection queries from graphiql
                return;
              }
              const elapsed = performance.now() - startTimestamp;

              // take the first part of the UA to help identify browser vs server requests
              const userAgent =
                ctx.context.req.headers["user-agent"]?.split(" ")[0];

              const msg = {
                operation: willSendResponseCtx.operationName,
                elapsed: `${elapsed.toFixed(2)}ms`,
                graphqlClient:
                  ctx.context.req.headers["apollographql-client-name"],
                ip: ctx.context.req.ip,
                userAgent,
              };
              if (willSendResponseCtx.errors) {
                willSendResponseCtx.logger.error(
                  JSON.stringify({
                    ...msg,
                    errors: willSendResponseCtx.errors,
                    stack: willSendResponseCtx.errors
                      .map((err) => err.stack)
                      // Filter stacks caused by an apollo Forbidden error to prevent cluttering logs
                      // with errors caused by a user being logged out.
                      .filter(
                        (stack) => stack && !stack.startsWith("ForbiddenError"),
                      ),
                  }),
                );
              } else {
                willSendResponseCtx.logger.info(JSON.stringify(msg));
                if (willSendResponseCtx.operationName) {
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
        settings: {
          "request.credentials": "include",
          "schema.polling.enable": false,
        },
      }),
    ],
  });
};
