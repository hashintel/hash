import {
  DatabasePoolConnectionType,
  DatabaseTransactionConnectionType,
} from "slonik";

export type PoolConnection = DatabasePoolConnectionType & {
  type: "Pool";
};

export type TransactionConnection = Omit<
  DatabaseTransactionConnectionType,
  "transaction"
> & { type: "Transaction" };

/**
 * Postgres connection types.
 * Note that {@link TransactionConnection} does not allow for nested transactions.
 * Construction of these types can be done through {@link createPoolConnection} or {@link createTransactionConnection}
 */
export type Connection = PoolConnection | TransactionConnection;

/**
 * Construct {@link PoolConnection} variant tagged with a type
 * @param database pool connection
 * @returns a {@link PoolConnection}
 */
export const createPoolConnection = (
  connection: DatabasePoolConnectionType,
): PoolConnection => Object.assign(connection, { type: "Pool" } as const);

/**
 * Construct {@link TransactionConnection} variant tagged a type
 * @param database transaction connection
 * @returns a {@link TransactionConnection}
 */
export const createTransactionConnection = (
  connection: DatabaseTransactionConnectionType,
): TransactionConnection =>
  Object.assign(connection, { type: "Transaction" } as const);
