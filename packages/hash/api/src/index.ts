import cors from "cors";

import { promisify } from "util";
import http from "http";
import path from "path";

import { json } from "body-parser";
import express from "express";
import helmet from "helmet";
import { StatsD } from "hot-shots";
import { customAlphabet } from "nanoid";
import { Tracker } from "@snowplow/node-tracker";
import { createHttpTerminator } from "http-terminator";
import { OpenSearch } from "@hashintel/hash-backend-utils/search/opensearch";
import { GracefulShutdown } from "@hashintel/hash-backend-utils/shutdown";
import { RedisQueueExclusiveConsumer } from "@hashintel/hash-backend-utils/queue/redis";
import { AsyncRedisClient } from "@hashintel/hash-backend-utils/redis";

import {
  monorepoRootDir,
  waitOnResource,
} from "@hashintel/hash-backend-utils/environment";
import setupAuth from "./auth";
import { RedisCache } from "./cache";
import { createCollabApp } from "./collab/collabApp";
import { createCollabWsApp } from "./collab/collabWsApp";
import { PostgresAdapter, setupCronJobs } from "./db";
import {
  AwsSesEmailTransporter,
  DummyEmailTransporter,
} from "./email/transporters";
import { createApolloServer } from "./graphql/createApolloServer";
import { CORS_CONFIG, FILE_UPLOAD_PROVIDER } from "./lib/config";
import {
  isDevEnv,
  isProdEnv,
  isStatsDEnabled,
  isTestEnv,
  port,
} from "./lib/env-config";
import { logger } from "./logger";
import { getRequiredEnv } from "./util";
import { setupStorageProviders } from "./storage/storage-provider-lookup";
import { getAwsRegion } from "./lib/aws-config";
import { setupTelemetry } from "./telemetry/snowplow-setup";
import { connectToTaskExecutor } from "./task-execution";

const shutdown = new GracefulShutdown(logger, "SIGINT", "SIGTERM");

const main = async () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let tracker: Tracker | undefined;
  if (process.env.HASH_TELEMETRY_ENABLED === "true") {
    logger.info("Starting [Snowplow] telemetry");

    const [spEmitter, spTracker] = setupTelemetry();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    tracker = spTracker;

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
        await promisify((statsd as StatsD).close).bind(statsd)();
      });
    }
  } catch (err) {
    logger.error(`Could not start StatsD client: ${err}`);
  }

  // Configure the Express server
  const app = express();
  app.use(cors(CORS_CONFIG));

  const pgHost = getRequiredEnv("HASH_PG_HOST");
  const pgPort = parseInt(getRequiredEnv("HASH_PG_PORT"), 10);
  const redisHost = getRequiredEnv("HASH_REDIS_HOST");
  const redisPort = parseInt(getRequiredEnv("HASH_REDIS_PORT"), 10);
  const taskExecutorHost = getRequiredEnv("HASH_TASK_EXECUTOR_HOST");
  const taskExecutorPort = parseInt(
    getRequiredEnv("HASH_TASK_EXECUTOR_PORT"),
    10,
  );

  await Promise.all([
    waitOnResource(`tcp:${pgHost}:${pgPort}`, logger),
    waitOnResource(`tcp:${redisHost}:${redisPort}`, logger),
  ]);

  // Connect to the database
  const pgConfig = {
    host: pgHost,
    user: getRequiredEnv("HASH_PG_USER"),
    password: getRequiredEnv("HASH_PG_PASSWORD"),
    database: getRequiredEnv("HASH_PG_DATABASE"),
    port: pgPort,
    maxPoolSize: 10, // @todo: needs tuning
  };
  const db = new PostgresAdapter(pgConfig, logger, statsd);
  shutdown.addCleanup("Postgres", async () => db.close());

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

  // Set sensible default security headers: https://www.npmjs.com/package/helmet
  // Temporarily disable contentSecurityPolicy for the GraphQL playground
  // Longer-term we can set rules which allow only the playground to load
  // Potentially only in development mode
  app.use(helmet({ contentSecurityPolicy: false }));

  // Parse request body as JSON - allow higher than the default 100kb limit
  app.use(json({ limit: "16mb" }));

  // Set up authentication related middeware and routes
  setupAuth(
    app,
    { secret: getRequiredEnv("SESSION_SECRET") },
    { ...pgConfig, maxPoolSize: 10 },
    db,
  );

  // Set up cron jobs
  setupCronJobs(db, logger);

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
      : new AwsSesEmailTransporter({
          from: `${getRequiredEnv(
            "SYSTEM_EMAIL_SENDER_NAME",
          )} <${getRequiredEnv("SYSTEM_EMAIL_ADDRESS")}>`,
          region: getAwsRegion(),
          subjectPrefix: isProdEnv ? undefined : "[DEV SITE] ",
        });

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
    db,
    search,
    cache: redis,
    taskExecutor,
    emailTransporter,
    logger,
    statsd,
    uploadProvider: FILE_UPLOAD_PROVIDER,
  });

  app.get("/", (_, res) => res.send("Hello World"));

  // Used by AWS Application Load Balancer (ALB) for health checks
  app.get("/health-check", (_, res) => res.status(200).send("Hello World!"));

  // Setup upload storage provider and express routes for local file uploads
  setupStorageProviders(app, FILE_UPLOAD_PROVIDER);

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

  // Register the collab backend
  const collabApp = await createCollabApp(collabRedisQueue);
  shutdown.addCleanup("collabApp", async () => collabApp.stop());
  app.use("/collab-backend", collabApp.router);

  const collabWsApp = createCollabWsApp(httpServer, collabRedisQueue);
  shutdown.addCleanup("collabWs", async () => (await collabWsApp).close());

  // Start the HTTP server
  await new Promise<void>((resolve) => {
    httpServer.listen({ port }, () => {
      logger.info(`Listening on port ${port}`);
      logger.info(`GraphQL path: ${apolloServer.graphqlPath}`);
      resolve();
    });
  });
};

void main().catch(async (err) => {
  logger.error(err);
  await shutdown.trigger();
});
