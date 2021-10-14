import express from "express";
import { json } from "body-parser";
import helmet from "helmet";
import { customAlphabet } from "nanoid";
import winston from "winston";
import { StatsD } from "hot-shots";
import { createServer, RequestListener } from "http";

import { PostgresAdapter, setupCronJobs } from "./db";
import { createApolloServer } from "./graphql/createApolloServer";
import setupAuth from "./auth";
import { getRequiredEnv } from "./util";
import { handleCollabRequest } from "./collab/server";
import AwsSesEmailTransporter from "./email/transporter/awsSesEmailTransporter";
import TestTransporter from "./email/transporter/testEmailTransporter";
import { logger } from "./logger";

import {
  isDevEnv,
  isProdEnv,
  isStatsDEnabled,
  isTestEnv,
  port,
} from "./lib/config";

const { FRONTEND_URL } = require("./lib/jsConfig");

// Request ID generator
const nanoid = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  14
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
  logger.warn(`Could not start StatsD client: {e}`);
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

  maximumPoolSize: 10, // @todo: needs tuning
};
const db = new PostgresAdapter(pgConfig, logger, statsd);

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
  { ...pgConfig, maximumPoolSize: 10 },
  db
);

// Set up cron jobs
setupCronJobs(db, logger);

// Create an email transporter
const transporter = isTestEnv
  ? new TestTransporter()
  : new AwsSesEmailTransporter();

const apolloServer = createApolloServer(db, transporter, logger, statsd);

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

// Ensure the GraphQL server has started before starting the HTTP server
apolloServer
  .start()
  .then(() => {
    apolloServer.applyMiddleware({
      app,
      cors: { credentials: true, origin: FRONTEND_URL },
    });

    const requestWrapper: RequestListener = (req, res) => {
      if (!handleCollabRequest(req, res)) {
        return app(req, res);
      }
    };

    const server = createServer(requestWrapper).listen(port, () => {
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
    console.error(err);
    process.exit(1);
  });
