import type { Server } from "node:http";
import { performance } from "node:perf_hooks";

import {
  ApolloServer,
  type ApolloServerPlugin,
  type BaseContext,
  type GraphQLRequestContext,
} from "@apollo/server";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { ApolloServerPluginLandingPageGraphQLPlayground } from "@apollo/server-plugin-landing-page-graphql-playground";
import { expressMiddleware } from "@as-integrations/express5";
import { makeExecutableSchema } from "@graphql-tools/schema";
import type { UploadableStorageProvider } from "@local/hash-backend-utils/file-storage";
import type { Logger } from "@local/hash-backend-utils/logger";
import type { SearchAdapter } from "@local/hash-backend-utils/search/adapter";
import type { TemporalClient } from "@local/hash-backend-utils/temporal";
import type { VaultClient } from "@local/hash-backend-utils/vault";
import { schema } from "@local/hash-isomorphic-utils/graphql/type-defs/schema";
import { getHashClientTypeFromRequest } from "@local/hash-isomorphic-utils/http-requests";
import * as Sentry from "@sentry/node";
import type { StatsD } from "hot-shots";

import { getActorIdFromRequest } from "../auth/get-actor-id";
import type { CacheAdapter } from "../cache";
import type { EmailTransporter } from "../email/transporters";
import type { GraphApi } from "../graph/context-types";
import type { GraphQLContext } from "./context";
import { resolvers } from "./resolvers";

// Taken from: https://github.com/apollographql/apollo-server/blob/17bf8639e84dda42d7a2b524a44b2123abcc7917/packages/server/src/plugin/usageReporting/plugin.ts#L847-L871
function defaultGenerateClientInfo<TContext extends BaseContext>({
  request,
}: GraphQLRequestContext<TContext>) {
  const clientNameHeaderKey = "apollographql-client-name";
  const clientVersionHeaderKey = "apollographql-client-version";

  // Default to using the `apollo-client-x` header fields if present.
  // If none are present, fallback on the `clientInfo` query extension
  // for backwards compatibility.
  // The default value if neither header values nor query extension is
  // set is the empty String for all fields (as per protobuf defaults)
  if (
    request.http?.headers.get(clientNameHeaderKey) ||
    request.http?.headers.get(clientVersionHeaderKey)
  ) {
    return {
      clientName: request.http.headers.get(clientNameHeaderKey),
      clientVersion: request.http.headers.get(clientVersionHeaderKey),
    };
  } else if (request.extensions?.clientInfo) {
    return request.extensions.clientInfo;
  } else {
    return {};
  }
}

const statsPlugin = ({
  statsd,
}: { statsd?: StatsD }): ApolloServerPlugin<GraphQLContext> => ({
  requestDidStart: async () => {
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

      didEncounterErrors: async (ctx) => {
        for (const err of ctx.errors) {
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

      willSendResponse: async (ctx) => {
        if (ctx.operationName === "IntrospectionQuery") {
          // Ignore introspection queries from graphiql
          return;
        }
        const elapsed = performance.now() - startTimestamp;

        // take the first part of the UA to help identify browser vs server requests
        const userAgent = ctx.request.http?.headers
          .get("user-agent")
          ?.split(" ")[0];

        const msg = {
          operation: ctx.operationName,
          elapsed: `${elapsed.toFixed(2)}ms`,
          clientInfo: defaultGenerateClientInfo(ctx),
          userAgent,
        };
        if (ctx.errors) {
          ctx.logger.error(
            JSON.stringify({
              ...msg,
              errors: ctx.errors,
              stack: ctx.errors
                .map((err) => err.stack)
                // Filter stacks caused by an apollo Forbidden error to prevent cluttering logs
                // with errors caused by a user being logged out.
                .filter(
                  (stack) => stack && !stack.startsWith("ForbiddenError"),
                ),
            }),
          );
        } else {
          ctx.logger.info(JSON.stringify(msg));
          if (ctx.operationName) {
            statsd?.timing(ctx.operationName, elapsed, 1, ["graphql"]);
          }
        }
      },
    };
  },
});

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
  httpServer: Server;
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
  httpServer,
}: CreateApolloServerParams) => {
  // go via makeExecutableSchema to set inheritResolversFromInterfaces
  const combinedSchema = makeExecutableSchema({
    typeDefs: schema,
    resolvers,
    inheritResolversFromInterfaces: true,
  });

  const dataSources: GraphQLContext["dataSources"] = {
    graphApi,
    cache,
    uploadProvider,
    search,
  };

  const server = new ApolloServer<GraphQLContext>({
    schema: combinedSchema,
    logger: logger.child({ service: "graphql" }),
    // @todo: we may want to disable introspection at some point for production
    introspection: true,
    includeStacktraceInErrorResponses: true, // required for stack traces to be captured
    plugins: [
      ApolloServerPluginLandingPageGraphQLPlayground({
        settings: {
          "request.credentials": "include",
          "schema.polling.enable": false,
        },
      }),
      statsPlugin({ statsd }),
      ApolloServerPluginDrainHttpServer({ httpServer }),
    ],
  });

  const middleware = expressMiddleware(server, {
    context: async ({ req, res }): Promise<GraphQLContext> => ({
      dataSources,
      authentication: { actorId: getActorIdFromRequest(req) },
      provenance: {
        actorType: "user",
        origin: {
          type: getHashClientTypeFromRequest(req) ?? "api",
          userAgent: req.headers["user-agent"],
        },
      },
      user: req.user,
      emailTransporter,
      logger: logger.child({
        requestId: res.get("x-hash-request-id") ?? "",
      }),
      temporal: temporalClient,
      vault: vaultClient,
    }),
  });

  return [server, middleware] as const;
};
