import { sql } from "slonik";
import {
  Connection,
  createTransactionConnection,
  TransactionConnection,
} from "./types";

export {
  createPoolConnection as poolConnection,
  createTransactionConnection as transactionConnection,
} from "./types";

/**
 * Conditionally create transaction or use active transaction depending on connection kind.
 * If the connection given is a top-level connection i.e. not a transaction, a transaction will be created.
 * Otherwise we simply make use of the transaction connection as is.
 * @param connection either top-level or one transaction level.
 * @returns handler callback
 */
export const transaction =
  (connection: Connection) =>
  <T>(handler: (conn: TransactionConnection) => Promise<T>): Promise<T> => {
    if (connection.type === "Pool") {
      return connection.transaction(async (conn) => {
        return handler(createTransactionConnection(conn));
      });
    } else {
      return handler(connection);
    }
  };

export const mapColumnNamesToSQL = (columnNames: string[], prefix?: string) =>
  sql.join(
    columnNames.map((columnName) =>
      sql.identifier([prefix || [], columnName].flat()),
    ),
    sql`, `,
  );
