import { sql } from "slonik";
import { Connection, ConnectionKind, transactionConnection } from "./types";

export { poolConnection, transactionConnection } from "./types";

/**
 * Conditionally create transaction or use active transaction depending on connection kind.
 * If the connection given is a top-level connection i.e. not a transaction, a transaction will be created.
 * Otherwise we simply make use of the transaction connection as is.
 * @param connection either top-level or one transaction level.
 * @returns handler callback
 */
export const transaction =
  (connection: Connection) =>
  async <T>(handler: (conn: Connection) => Promise<T>): Promise<T> => {
    if (connection._tag === ConnectionKind.PoolConnection) {
      return connection.transaction(async (conn) => {
        return await handler(transactionConnection(conn));
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
