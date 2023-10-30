import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";

import { TypeSystemInitializer } from "@blockprotocol/type-system";
import {
  monorepoRootDir,
  realtimeSyncEnabled,
  waitOnResource,
} from "@local/hash-backend-utils/environment";
import { OpenSearch } from "@local/hash-backend-utils/search/opensearch";
import { GracefulShutdown } from "@local/hash-backend-utils/shutdown";
import { oryKratosPublicUrl } from "@local/hash-isomorphic-utils/environment";
import { Session } from "@ory/client";
import type { Client as TemporalClient } from "@temporalio/client";
import { json } from "body-parser";
import cors from "cors";
import express, { raw } from "express";
import proxy from "express-http-proxy";
import helmet from "helmet";
import { StatsD } from "hot-shots";
import { createHttpTerminator } from "http-terminator";
import { customAlphabet } from "nanoid";

import setupAuth from "./auth";
import { RedisCache } from "./cache";
import {
  AwsSesEmailTransporter,
  DummyEmailTransporter,
  EmailTransporter,
} from "./email/transporters";
import {
  createGraphClient,
  ensureSystemGraphIsInitialized,
  ImpureGraphContext,
} from "./graph";
import { User } from "./graph/knowledge/system-types/user";
import { ensureLinearOrgExists } from "./graph/linear-org";
import { ensureLinearTypesExist } from "./graph/linear-types";
import { createApolloServer } from "./graphql/create-apollo-server";
import { registerOpenTelemetryTracing } from "./graphql/opentelemetry";
import { oAuthLinear, oAuthLinearCallback } from "./integrations/linear/oauth";
import { linearWebhook } from "./integrations/linear/webhook";
import { createIntegrationSyncBackWatcher } from "./integrations/sync-back-watcher";
import { getAwsRegion } from "./lib/aws-config";
import {
  CORS_CONFIG,
  getEnvStorageType,
  LOCAL_FILE_UPLOAD_PATH,
} from "./lib/config";
import {
  isDevEnv,
  isProdEnv,
  isStatsDEnabled,
  isTestEnv,
  port,
} from "./lib/env-config";
import { logger } from "./logger";
import { seedOrgsAndUsers } from "./seed-data";
import { setupFileProxyHandler, setupStorageProviders } from "./storage";
import { setupTelemetry } from "./telemetry/snowplow-setup";
import { createTemporalClient } from "./temporal";
import { getRequiredEnv } from "./util";
import { createVaultClient, VaultClient } from "./vault";

declare global {
  namespace Express {
    interface Request {
      context: ImpureGraphContext & {
        temporalClient?: TemporalClient;
        vaultClient?: VaultClient;
      };
      session: Session | undefined;
      user: User | undefined;
    }
  }
}

const shutdown = new GracefulShutdown(logger, "SIGINT", "SIGTERM");

const main = async () => {
  await TypeSystemInitializer.initialize();
  logger.info("Type System initialized");

  registerOpenTelemetryTracing(process.env.HASH_OTLP_ENDPOINT ?? null);

  if (process.env.HASH_TELEMETRY_ENABLED === "true") {
    logger.info("Starting [Snowplow] telemetry");

    const [spEmitter] = setupTelemetry();

    shutdown.addCleanup("Snowplow Telemetry", async () => {
      logger.info("Flushing [Snowplow] telemetry");
      spEmitter.flush();
    });
  }

  // Request ID generator
  const nanoid = customAlphabet(
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
    14,
  );

  // Configure the StatsD client for reporting metrics
  let statsd: StatsD | undefined;
  try {
    if (isStatsDEnabled) {
      const statsdHost = process.env.STATSD_HOST;
      const statsdPort = parseInt(process.env.STATSD_PORT || "8125", 10);
      await waitOnResource(`tcp:${statsdHost}:${statsdPort}`, logger);

      statsd = new StatsD({
        host: statsdHost,
        port: statsdPort,
      });
      shutdown.addCleanup("StatsD", async () => {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        await promisify((statsd as StatsD).close).bind(statsd)();
      });
    }
  } catch (err) {
    logger.error(`Could not start StatsD client: ${err}`);
  }

  // Configure the Express server
  const app = express();
  app.use(cors(CORS_CONFIG));

  const redisHost = getRequiredEnv("HASH_REDIS_HOST");
  const redisPort = parseInt(getRequiredEnv("HASH_REDIS_PORT"), 10);

  const graphApiHost = getRequiredEnv("HASH_GRAPH_API_HOST");
  const graphApiPort = parseInt(getRequiredEnv("HASH_GRAPH_API_PORT"), 10);

  await Promise.all([
    waitOnResource(`tcp:${redisHost}:${redisPort}`, logger),
    waitOnResource(`tcp:${graphApiHost}:${graphApiPort}`, logger),
  ]);

  // Connect to Redis
  const redis = new RedisCache(logger, {
    host: redisHost,
    port: redisPort,
  });
  shutdown.addCleanup("Redis", async () => redis.close());

  // Connect to the Graph API
  const graphApi = createGraphClient(logger, {
    host: graphApiHost,
    port: graphApiPort,
  });

  const FILE_UPLOAD_PROVIDER = getEnvStorageType();
  // Setup upload storage provider and express routes for local file uploads
  const uploadProvider = setupStorageProviders(app, FILE_UPLOAD_PROVIDER);

  const temporalClient = await createTemporalClient(logger);

  const vaultClient = createVaultClient();

  const context = { graphApi, uploadProvider };

  setupFileProxyHandler(app, uploadProvider, redis);

  await ensureSystemGraphIsInitialized({ logger, context });

  if (process.env.LINEAR_CLIENT_ID) {
    await ensureLinearOrgExists({ logger, context });

    await ensureLinearTypesExist({ logger, context });
  }

  // This will seed users, an org and pages.
  // Configurable through environment variables.
  await seedOrgsAndUsers({ logger, context });

  // Set sensible default security headers: https://www.npmjs.com/package/helmet
  // Temporarily disable contentSecurityPolicy for the GraphQL playground
  // Longer-term we can set rules which allow only the playground to load
  // Potentially only in development mode
  app.use(helmet({ contentSecurityPolicy: false }));

  const jsonParser = json({
    // default is 100kb
    limit: "16mb",
  });
  const rawParser = raw({ type: "application/json" });

  // Body parsing middleware
  app.use((req, res, next) => {
    if (
      req.path.startsWith("/webhooks/") ||
      req.path === LOCAL_FILE_UPLOAD_PATH
    ) {
      // webhooks typically need the raw body for signature verification
      return rawParser(req, res, next);
    }
    return jsonParser(req, res, next);
  });

  // Set up authentication related middleware and routes
  setupAuth({ app, logger, context });

  // Create an email transporter
  const emailTransporter =
    isTestEnv || isDevEnv || process.env.HASH_EMAIL_TRANSPORTER === "dummy"
      ? new DummyEmailTransporter({
          copyCodesOrLinksToClipboard:
            process.env.DUMMY_EMAIL_TRANSPORTER_USE_CLIPBOARD === "true",
          displayCodesOrLinksInStdout: true,
          filePath: process.env.DUMMY_EMAIL_TRANSPORTER_FILE_PATH
            ? path.resolve(
                monorepoRootDir,
                process.env.DUMMY_EMAIL_TRANSPORTER_FILE_PATH,
              )
            : undefined,
        })
      : process.env.AWS_REGION
      ? new AwsSesEmailTransporter({
          from: `${getRequiredEnv(
            "SYSTEM_EMAIL_SENDER_NAME",
          )} <${getRequiredEnv("SYSTEM_EMAIL_ADDRESS")}>`,
          region: getAwsRegion(),
          subjectPrefix: isProdEnv ? undefined : "[DEV SITE] ",
        })
      : ({
          sendMail: (mail) => {
            logger.info(`Tried to send mail to ${mail.to}:\n${mail.html}`);
          },
        } as EmailTransporter);

  let search: OpenSearch | undefined;
  if (process.env.HASH_OPENSEARCH_ENABLED === "true") {
    const searchAuth =
      process.env.HASH_OPENSEARCH_USERNAME === undefined
        ? undefined
        : {
            username: process.env.HASH_OPENSEARCH_USERNAME,
            password: process.env.HASH_OPENSEARCH_PASSWORD || "",
          };
    search = await OpenSearch.connect(logger, {
      host: getRequiredEnv("HASH_OPENSEARCH_HOST"),
      port: parseInt(process.env.HASH_OPENSEARCH_PORT || "9200", 10),
      auth: searchAuth,
      httpsEnabled: !!process.env.HASH_OPENSEARCH_HTTPS_ENABLED,
    });
    shutdown.addCleanup("OpenSearch", async () => search!.close());
  }

  const apolloServer = createApolloServer({
    graphApi,
    search,
    uploadProvider,
    temporalClient,
    vaultClient,
    cache: redis,
    emailTransporter,
    logger,
    statsd,
  });

  // Make the data sources/clients available to REST controllers
  // @todo figure out sharing of context between REST and GraphQL without repeating this
  app.use((req, _res, next) => {
    req.context = {
      graphApi,
      temporalClient,
      uploadProvider,
      vaultClient,
    };
    next();
  });

  app.get("/", (_, res) => res.send("Hello World"));

  // Used by AWS Application Load Balancer (ALB) for health checks
  app.get("/health-check", (_, res) => res.status(200).send("Hello World!"));

  app.use((req, res, next) => {
    const requestId = nanoid();
    res.set("x-hash-request-id", requestId);
    if (isProdEnv) {
      logger.info({
        requestId,
        method: req.method,
        ip: req.ip,
        path: req.path,
        message: "request",
        userAgent: req.headers["user-agent"],
        graphqlClient: req.headers["apollographql-client-name"],
      });
    }
    next();
  });

  /**
   * Add a proxy for requests to the Ory Kratos public API, to be consumed
   * by the frontend for authentication related requests made in the
   * browser. Note that server-side frontend authentication requests
   * can be sent the the Ory Kratos public URL directly, because the
   * CORS requirements are not as strict as the one from the browser.
   */
  app.use("/auth/*", cors(CORS_CONFIG), (req, res, next) => {
    const expectedAccessControlAllowOriginHeader = res.getHeader(
      "Access-Control-Allow-Origin",
    );

    if (!oryKratosPublicUrl) {
      throw new Error("`ORY_KRATOS_PUBLIC_URL` has not been provided");
    }

    return proxy(oryKratosPublicUrl, {
      /**
       * Remove the `/auth` prefix from the request path, so the path is
       * formatted correctly for the Ory Kratos API.
       */
      proxyReqPathResolver: ({ originalUrl }) =>
        originalUrl.replace("/auth", ""),
      /**
       * Ory Kratos includes the wildcard `*` in the `Access-Control-Allow-Origin`
       * by default, which is not permitted by browsers when including credentials
       * in requests.
       *
       * When setting the value of the `Access-Control-Allow-Origin` header in
       * the Ory Kratos configuration, the frontend URL is included twice in the
       * header for some reason (e.g. ["https://localhost:3000", "https://localhost:3000"]),
       * which is also not permitted by browsers when including credentials in requests.
       *
       * Therefore we manually set the `Access-Control-Allow-Origin` header to the
       * expected value here before returning the response, to prevent CORS errors
       * in modern browsers.
       */
      userResDecorator: (_proxyRes, proxyResData, _userReq, userRes) => {
        if (typeof expectedAccessControlAllowOriginHeader === "string") {
          userRes.set(
            "Access-Control-Allow-Origin",
            expectedAccessControlAllowOriginHeader,
          );
        }
        return proxyResData;
      },
    })(req, res, next);
  });

  // Integrations
  app.get("/oauth/linear", oAuthLinear);
  app.get("/oauth/linear/callback", oAuthLinearCallback);
  app.post("/webhooks/linear", linearWebhook);

  // Create the HTTP server.
  // Note: calling `close` on a `http.Server` stops new connections, but it does not
  // close active connections. This can result in the server hanging indefinitely. We
  // use the `http-terminator` library to shut down the server properly.
  const httpServer = http.createServer(app);
  const httpTerminator = createHttpTerminator({ server: httpServer });
  shutdown.addCleanup("HTTP Server", async () => httpTerminator.terminate());

  // Start the Apollo GraphQL server.
  // Note: the server must be started before the middleware can be applied
  await apolloServer.start();
  shutdown.addCleanup("ApolloServer", async () => apolloServer.stop());
  apolloServer.applyMiddleware({
    app,
    cors: CORS_CONFIG,
  });

  // Start the HTTP server before setting up the integration listener
  // This is done because the Redis client blocks when instantiated
  // and we must ensure that the health checks are available ASAP.
  await new Promise<void>((resolve) => {
    httpServer.listen({ port }, () => {
      logger.info(`Listening on port ${port}`);
      logger.info(`GraphQL path: ${apolloServer.graphqlPath}`);
      resolve();
    });
  });

  if (realtimeSyncEnabled) {
    const integrationSyncBackWatcher =
      await createIntegrationSyncBackWatcher(graphApi);

    void integrationSyncBackWatcher.start();

    shutdown.addCleanup(
      "Integration sync back watcher",
      integrationSyncBackWatcher.stop,
    );
  }
};

void main().catch(async (err) => {
  logger.error(err);
  await shutdown.trigger();
});
