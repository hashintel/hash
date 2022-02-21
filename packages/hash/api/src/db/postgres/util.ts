import { sql } from "slonik";
import { Connection, ConnectionKind, transactionConnection } from "./types";

export { poolConnection, transactionConnection } from "./types";

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
