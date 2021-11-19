import { RedisQueueExclusiveConsumer } from "@hashintel/hash-backend-utils/queue/redis";
import { AsyncRedisClient } from "@hashintel/hash-backend-utils/redis";
import { json } from "body-parser";
import express from "express";
import helmet from "helmet";
import { StatsD } from "hot-shots";
import { customAlphabet } from "nanoid";
import setupAuth from "./auth";
import { RedisCache } from "./cache";
import { createCollabApp } from "./collab/collabApp";
import { PostgresAdapter, setupCronJobs } from "./db";
import AwsSesEmailTransporter from "./email/transporter/awsSesEmailTransporter";
import TestTransporter from "./email/transporter/testEmailTransporter";
import { StorageType } from "./graphql/apiTypes.gen";
import { createApolloServer } from "./graphql/createApolloServer";
import {
  AWS_REGION,
  AWS_S3_BUCKET,
  AWS_S3_REGION,
  CORS_CONFIG,
  FILE_UPLOAD_PROVIDER,
} from "./lib/config";
import { isProdEnv, isStatsDEnabled, isTestEnv, port } from "./lib/env-config";
import { logger } from "./logger";
import {
  ExternalStorageProvider,
  StorageProviders,
  UploadableStorageProvider,
} from "./storage";
import { AwsS3StorageProvider } from "./storage/aws-s3-storage-provider";
import { getRequiredEnv } from "./util";

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

const redisClientConfig = {
  host: getRequiredEnv("HASH_REDIS_HOST"),
  port: parseInt(getRequiredEnv("HASH_REDIS_PORT"), 10),
};
// Connect to Redis
const redis = new RedisCache(redisClientConfig);

// Connect to Redis queue for collab
const collabRedisClient = new AsyncRedisClient(redisClientConfig);
const collabRedisQueue = new RedisQueueExclusiveConsumer(collabRedisClient);

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

/** All storage providers usable by the API should be added here */
const storageProviders: StorageProviders = {
  [StorageType.AwsS3]: new AwsS3StorageProvider({
    bucket: AWS_S3_BUCKET,
    region: AWS_S3_REGION,
  }),
  [StorageType.ExternalLink]: new ExternalStorageProvider(),
};

const apolloServer = createApolloServer({
  db,
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

Promise.all([createCollabApp(collabRedisQueue), apolloServer.start()])
  .then(([collabApp]) => {
    apolloServer.applyMiddleware({
      app,
      cors: CORS_CONFIG,
    });

    app.use("/collab-backend", collabApp.router);

    const server = app.listen(port, () => {
      logger.info(`Listening on port ${port}`);
    });

    // Gracefully shutdown on receiving a termination signal.
    let receivedTerminationSignal = false;
    const shutdown = (signal: string) => {
      if (receivedTerminationSignal) {
        return;
      }
      receivedTerminationSignal = true;

      logger.info(`${signal} signal received: Closing Express server`);
      server.close(() => {
        logger.info("Express server closed");
      });

      collabRedisQueue
        .release()
        .then(() => collabRedisClient.close())
        .then(() => logger.info("Collab redis connection closed"))
        .catch((err) => logger.error(err));

      collabApp.stop();

      logger.info("Closing database connection pool");
      db.close()
        .then(() => logger.info("Database connection pool closed"))
        .catch((err) => logger.error(err));

      if (statsd) {
        logger.info("Closing the StatsD client");
        statsd.close(() => logger.info("StatsD client closed"));
      }

      logger.info("SHUTDOWN");
      process.exit(0);
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  })
  .catch((err) => {
    logger.error(err);
    process.exit(1);
  });
