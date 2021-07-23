import express from "express";
import { json } from "body-parser";
import helmet from "helmet";
import { customAlphabet } from "nanoid";
import winston from "winston";
import { StatsD } from "hot-shots";

import { PostgresAdapter } from "./db";
import { createApolloServer } from "./graphql/createApolloServer";

// Request ID generator
const nanoid = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  14
);

// Configure the logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.json(),
    winston.format.timestamp()
  ),
  defaultMeta: { service: "api" },
});

if (process.env.NODE_ENV === "development") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
} else {
  // TODO: add production logging transport here
  // Datadog: https://github.com/winstonjs/winston/blob/master/docs/transports.md#datadog-transport
}

// Configure the StatsD client for reporting metrics
let statsd: StatsD | undefined;
try {
  if (parseInt(process.env.STATSD_ENABLED || "0") === 1) {
    statsd = new StatsD({
      port: parseInt(process.env.STATSD_PORT || "8125"), // 8125 is default StatsD port
      host: process.env.STATSD_HOST,
    });
  }
} catch (err) {
  logger.warn(`Could not start StatsD client: {e}`);
}

// Configure the Express server
const app = express();
const PORT = process.env.PORT ?? 5001;

// Connect to the database
const db = new PostgresAdapter(statsd);

// Set sensible default security headers: https://www.npmjs.com/package/helmet
// Temporarily disable contentSecurityPolicy for the GraphQL playground
// Longer-term we can set rules which allow only the playground to load
// Potentially only in development mode
app.use(helmet({ contentSecurityPolicy: false }));

// Parse request body as JSON - allow higher than the default 100kb limit
app.use(json({ limit: "16mb" }));

const apolloServer = createApolloServer(db, logger);

app.get("/", (_, res) => res.send("Hello World"));

app.use((req, res, next) => {
  const requestId = nanoid();
  res.set("x-hash-request-id", requestId);
  if (process.env.NODE_ENV !== "development") {
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
apolloServer.start().then(() => {
  apolloServer.applyMiddleware({ app });

  const server = app.listen(PORT, () =>
    logger.info(`Listening on port ${PORT}`)
  );

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
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
});
