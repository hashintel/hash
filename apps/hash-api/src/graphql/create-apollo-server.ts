import type { Server } from "node:http";
import { performance } from "node:perf_hooks";

import { ApolloServer, type ApolloServerPlugin } from "@apollo/server";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import {
  ApolloServerPluginLandingPageLocalDefault,
  ApolloServerPluginLandingPageProductionDefault,
} from "@apollo/server/plugin/landingPage/default";
import { KeyvAdapter } from "@apollo/utils.keyvadapter";
import { expressMiddleware } from "@as-integrations/express5";
import { makeExecutableSchema } from "@graphql-tools/schema";
import type { FileStorageProvider } from "@local/hash-backend-utils/file-storage";
import type { Logger } from "@local/hash-backend-utils/logger";
import type { TemporalClient } from "@local/hash-backend-utils/temporal";
import type { VaultClient } from "@local/hash-backend-utils/vault";
import { schema } from "@local/hash-isomorphic-utils/graphql/type-defs/schema";
import {
  getHashClientTypeFromRequest,
  hashClientHeaderKey,
} from "@local/hash-isomorphic-utils/http-requests";
import * as Sentry from "@sentry/node";
import type { StatsD } from "hot-shots";
import type Keyv from "keyv";

import { getActorIdFromRequest } from "../auth/get-actor-id";
import type { EmailTransporter } from "../email/transporters";
import type { GraphApi } from "../graph/context-types";
import { isProdEnv } from "../lib/env-config";
import type { GraphQLContext } from "./context";
import { resolvers } from "./resolvers";

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
          clientInfo: {
            clientName: ctx.request.http?.headers.get(hashClientHeaderKey),
          },
          userAgent,
        };
        if (ctx.errors) {
          if (ctx.errors[0]?.extensions.code !== "FORBIDDEN") {
            /** Log errors unrelated to auth failures */
            ctx.logger.error(
              JSON.stringify({
                ...msg,
                errors: ctx.errors,
                stack: ctx.errors.map((err) => err.stack),
              }),
            );
          }
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
  cache: Keyv;
  uploadProvider: FileStorageProvider;
  temporalClient: TemporalClient;
  vaultClient?: VaultClient;
  emailTransporter: EmailTransporter;
  logger: Logger;
  statsd?: StatsD;
  httpServer: Server;
}

export const createApolloServer = async ({
  graphApi,
  cache,
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
    uploadProvider,
  };

  const server = new ApolloServer<GraphQLContext>({
    schema: combinedSchema,
    cache: new KeyvAdapter(cache),
    logger: logger.child({ service: "graphql" }),
    // @todo: we may want to disable introspection at some point for production
    introspection: true,
    includeStacktraceInErrorResponses: true, // required for stack traces to be captured
    plugins: [
      isProdEnv
        ? ApolloServerPluginLandingPageProductionDefault({ footer: false })
        : ApolloServerPluginLandingPageLocalDefault({
            embed: {
              endpointIsEditable: false,
              initialState: {
                pollForSchemaUpdates: false,
              },
              runTelemetry: false,
            },
            document: `{
  me {
    subgraph {
      vertices
    }
  }
}`,
          }),
      statsPlugin({ statsd }),
      ApolloServerPluginDrainHttpServer({ httpServer }),
    ],
  });

  // Note: the server must be started before the middleware can be applied
  await server.start();

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
