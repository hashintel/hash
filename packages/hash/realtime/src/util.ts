import winston from "winston";
import { createPool, DatabasePoolType } from "slonik";

export type ConnPool = DatabasePoolType;

/** Gets an environment variable. Throws an error if it's not set and a fallback
 * value is not provided. */
export const getRequiredEnv = (name: string, fallback?: string) => {
  if (process.env[name]) {
    return process.env[name] as string;
  }
  if (fallback) {
    return fallback;
  }
  throw new Error(`environment variable ${name} is required`);
};

/** Create a connection pool to the Postgres database */
export const createPostgresConnPool = (
  logger: winston.Logger,
  params: {
    user: string;
    password: string;
    host: string;
    port: number;
    database: string;
    maxPoolSize: number;
  }
): ConnPool => {
  const { user, password, host, port, database } = params;
  const connStr = `postgresql://${user}:${password}@${host}:${port}/${database}`;

  return createPool(connStr, {
    captureStackTrace: true,
    maximumPoolSize: params.maxPoolSize,
    interceptors: [
      {
        queryExecutionError: (
          { queryId, originalQuery, stackTrace },
          _query,
          error,
          _notices
        ) => {
          logger.error({
            message: "sql_query_error",
            queryId,
            query: originalQuery.sql,
            errorMessage: `${error.name}: ${error.message}`,
            stackTrace,
          });
          return null;
        },
      },
    ],
  });
};

// Create a Logger
export const createLogger = (service: string) => {
  const logger = winston.createLogger({
    level: "info",
    format: winston.format.combine(
      winston.format.json(),
      winston.format.timestamp()
    ),
    defaultMeta: { service },
  });

  if (process.env.NODE_ENV === "development") {
    logger.add(
      new winston.transports.Console({
        level: "debug",
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

  return logger;
};
