import { promisify } from "util";
import http from "http";

import { json } from "body-parser";
import express from "express";
import helmet from "helmet";
import { StatsD } from "hot-shots";
import { customAlphabet } from "nanoid";
import { createHttpTerminator } from "http-terminator";
import { OpenSearch } from "@hashintel/hash-backend-utils/search/opensearch";
import { GracefulShutdown } from "@hashintel/hash-backend-utils/shutdown";
import { RedisQueueExclusiveConsumer } from "@hashintel/hash-backend-utils/queue/redis";
import { AsyncRedisClient } from "@hashintel/hash-backend-utils/redis";

import setupAuth from "./auth";
import { RedisCache } from "./cache";
import { createCollabApp } from "./collab/collabApp";
import { PostgresAdapter, setupCronJobs } from "./db";
import AwsSesEmailTransporter from "./email/transporter/awsSesEmailTransporter";
import TestTransporter from "./email/transporter/testEmailTransporter";
import { createApolloServer } from "./graphql/createApolloServer";
import {
  AWS_REGION,
  CORS_CONFIG,
  FILE_UPLOAD_PROVIDER,
  storageProviders,
} from "./lib/config";
import { isProdEnv, isStatsDEnabled, isTestEnv, port } from "./lib/env-config";
import { logger } from "./logger";
import { UploadableStorageProvider } from "./storage";
import { getRequiredEnv } from "./util";

const shutdown = new GracefulShutdown(logger, "SIGINT", "SIGTERM");

const main = async () => {
  // Request ID generator
  const nanoid = customAlphabet(
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
    14,
  );

  // Configure the StatsD client for reporting metrics
  let statsd: StatsD | undefined;
  try {
    if (isStatsDEnabled) {
      statsd = new StatsD({
        port: parseInt(process.env.STATSD_PORT || "8125", 10), // 8125 is default StatsD port
        host: process.env.STATSD_HOST,
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

  // Connect to the database
  const pgConfig = {
    host: getRequiredEnv("HASH_PG_HOST"),
    user: getRequiredEnv("HASH_PG_USER"),
    password: getRequiredEnv("HASH_PG_PASSWORD"),
    database: getRequiredEnv("HASH_PG_DATABASE"),
    port: parseInt(getRequiredEnv("HASH_PG_PORT"), 10),
    maxPoolSize: 10, // @todo: needs tuning
  };
  const db = new PostgresAdapter(pgConfig, logger, statsd);
  shutdown.addCleanup("Postgres", async () => db.close());

  // Connect to Redis
  const redis = new RedisCache({
    host: getRequiredEnv("HASH_REDIS_HOST"),
    port: parseInt(getRequiredEnv("HASH_REDIS_PORT"), 10),
  });
  shutdown.addCleanup("Redis", async () => redis.close());

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
  const emailTransporter = isTestEnv
    ? new TestTransporter()
    : new AwsSesEmailTransporter(AWS_REGION);

  const searchAuth =
    process.env.HASH_OPENSEARCH_USERNAME === undefined
      ? undefined
      : {
          username: process.env.HASH_OPENSEARCH_USERNAME,
          password: process.env.HASH_OPENSEARCH_PASSWORD || "",
        };
  const search = await OpenSearch.connect(logger, {
    host: getRequiredEnv("HASH_OPENSEARCH_HOST"),
    port: parseInt(process.env.HASH_OPENSEARCH_PORT || "9200", 10),
    auth: searchAuth,
    httpsEnabled: !!process.env.HASH_OPENSEARCH_HTTPS_ENABLED,
  });
  shutdown.addCleanup("OpenSearch", async () => search.close());

  const apolloServer = createApolloServer({
    db,
    search,
    cache: redis,
    emailTransporter,
    logger,
    statsd,
    storageProviders,
    uploadProvider: storageProviders[
      FILE_UPLOAD_PROVIDER
    ] as UploadableStorageProvider,
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

  // Connect to Redis queue for collab
  const collabRedisClient = new AsyncRedisClient({
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

  // Start the HTTP server
  await new Promise<void>((resolve) =>
    httpServer.listen({ port }, () => {
      logger.info(`Listening on port ${port}`);
      logger.info(`GraphQL path: ${apolloServer.graphqlPath}`);
      resolve();
    }),
  );
};

void main().catch(async (err) => {
  logger.error(err);
  await shutdown.trigger();
});
