import type { DatabasePoolType } from "slonik";
import { createPool } from "slonik";

import type { Logger } from "./logger.js";

export type PgPool = DatabasePoolType;

/** Create a connection pool to a Postgres database */
export const createPostgresConnPool = (
  logger: Logger,
  params: {
    user: string;
    password: string;
    host: string;
    port: number;
    database: string;
    maxPoolSize: number;
  },
): PgPool => {
  const { user, password, host, port, database } = params;
  const connStr = `postgresql://${user}:${password}@${host}:${port}/${database}`;

  return createPool(connStr, {
    captureStackTrace: true,
    connectionTimeout: 10_000,
    maximumPoolSize: params.maxPoolSize,
    interceptors: [
      {
        queryExecutionError: (
          { queryId, originalQuery, stackTrace, transactionId },
          _query,
          error,
          _notices,
        ) => {
          logger.error({
            message: "sql_query_error",
            queryId,
            query: originalQuery.sql,
            errorMessage: `${error.name}: ${error.message}`,
            stackTrace,
            transactionId,
          });
          return null;
        },
      },
    ],
  });
};
