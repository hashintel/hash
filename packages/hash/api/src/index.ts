import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";

import { TypeSystemInitializer } from "@blockprotocol/type-system";
import {
  monorepoRootDir,
  waitOnResource,
} from "@local/hash-backend-utils/environment";
import { RedisQueueExclusiveConsumer } from "@local/hash-backend-utils/queue/redis";
import { AsyncRedisClient } from "@local/hash-backend-utils/redis";
import { OpenSearch } from "@local/hash-backend-utils/search/opensearch";
import { GracefulShutdown } from "@local/hash-backend-utils/shutdown";
import { json } from "body-parser";
import cors from "cors";
import express from "express";
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
import { createGraphClient, ensureSystemGraphIsInitialized } from "./graph";
import { createApolloServer } from "./graphql/create-apollo-server";
import { registerOpenTelemetryTracing } from "./graphql/opentelemetry";
import { getAwsRegion } from "./lib/aws-config";
import { CORS_CONFIG, getEnvStorageType } from "./lib/config";
import {
  isDevEnv,
  isProdEnv,
  isStatsDEnabled,
  isTestEnv,
  port,
} from "./lib/env-config";
import { logger } from "./logger";
import { seedOrgsAndUsers } from "./seed-data";
import {
  setupFileProxyHanlder as setupFileProxyHandler,
  setupStorageProviders,
} from "./storage";
import { connectToTaskExecutor } from "./task-execution";
import { setupTelemetry } from "./telemetry/snowplow-setup";
import { getRequiredEnv } from "./util";

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
  const taskExecutorHost = getRequiredEnv("HASH_TASK_EXECUTOR_HOST");
  const taskExecutorPort = parseInt(
    getRequiredEnv("HASH_TASK_EXECUTOR_PORT"),
    10,
  );

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

  // Connect to the HASH-Task-Executor
  const taskExecutorConfig = {
    host: taskExecutorHost,
    port: taskExecutorPort,
  };
  const taskExecutor = connectToTaskExecutor(taskExecutorConfig);

  // Connect to the Graph API
  const graphApi = createGraphClient(logger, {
    host: graphApiHost,
    port: graphApiPort,
  });

  const FILE_UPLOAD_PROVIDER = getEnvStorageType();
  // Setup upload storage provider and express routes for local file uploads
  const uploadProvider = setupStorageProviders(app, FILE_UPLOAD_PROVIDER);

  const context = { graphApi, uploadProvider };

  setupFileProxyHandler(app, uploadProvider, redis);

  await ensureSystemGraphIsInitialized({ logger, context });

  // This will seed users, an org and pages.
  // Configurable through environment variables.
  await seedOrgsAndUsers({ logger, context });

  // Set sensible default security headers: https://www.npmjs.com/package/helmet
  // Temporarily disable contentSecurityPolicy for the GraphQL playground
  // Longer-term we can set rules which allow only the playground to load
  // Potentially only in development mode
  app.use(helmet({ contentSecurityPolicy: false }));

  // Parse request body as JSON - allow higher than the default 100kb limit
  app.use(json({ limit: "16mb" }));

  // Set up authentication related middleware and routes
  setupAuth({ app, logger, context });

  // Create an email transporter
  const emailTransporter =
    (isTestEnv || isDevEnv) && process.env.HASH_EMAIL_TRANSPORTER === "dummy"
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
    cache: redis,
    taskExecutor,
    emailTransporter,
    logger,
    statsd,
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

  // Start the HTTP server before setting up collab
  // This is done because the Redis client blocks when instantiated
  // and we must ensure that the health checks are available ASAP.
  // It is not a problem to set up collab after the fact that we begin listening.
  await new Promise<void>((resolve) => {
    httpServer.listen({ port }, () => {
      logger.info(`Listening on port ${port}`);
      logger.info(`GraphQL path: ${apolloServer.graphqlPath}`);
      resolve();
    });
  });

  // Connect to Redis queue for collab
  const collabRedisClient = new AsyncRedisClient(logger, {
    host: getRequiredEnv("HASH_REDIS_HOST"),
    port: parseInt(getRequiredEnv("HASH_REDIS_PORT"), 10),
  });
  shutdown.addCleanup("collabRedisClient", async () =>
    collabRedisClient.close(),
  );
  const collabRedisQueue = new RedisQueueExclusiveConsumer(collabRedisClient);
  shutdown.addCleanup("collabRedisQueue", async () =>
    collabRedisQueue.release(),
  );
};

void main().catch(async (err) => {
  logger.error(err);
  await shutdown.trigger();
});
