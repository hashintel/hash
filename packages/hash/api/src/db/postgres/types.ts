import {
  DatabasePoolConnectionType,
  DatabaseTransactionConnectionType,
} from "slonik";

// The variant kinds are distinct types.
// Enum and union types unify at the top level type, which isn't desired for these typings.
export type PoolConnectionKind = "PoolConnectionKind";
export type TransactionConnectionKind = "TransactionConnection";

/**
 * The types given for {@link PoolConnectionKind} and {@link TransactionConnectionKind} cannot be used as values directly.
 * This object maps a connection kind to its type.
 */
export const ConnectionKind = {
  PoolConnection: <PoolConnectionKind>"PoolConnectionKind",
  TransactionConnection: <TransactionConnectionKind>"TransactionConnectionKind",
};

export type PoolConnection = DatabasePoolConnectionType;
export type TransactionConnection = Omit<
  DatabaseTransactionConnectionType,
  "transaction"
>;

/**
 * Defines a tagging of type variants such that they can be narrowed at runtime.
 */
export type Tag<Typ, UnionTag> = Typ & { _tag: UnionTag };

/**
 * Postgres connection types.
 * Note that {@link TransactionConnection} does not allow for nested transactions.
 * Construction of these types can be done through {@link poolConnection} or {@link transactionConnection}
 */
export type Connection =
  | Tag<PoolConnection, PoolConnectionKind>
  | Tag<TransactionConnection, TransactionConnectionKind>;

/**
 * Construct {@link PoolConnection} variant tagged with {@link PoolConnectionKind}
 * @param database pool connection
 * @returns a {@link Connection}
 */
export const poolConnection = (connection: PoolConnection): Connection =>
  Object.assign(connection, { _tag: ConnectionKind.PoolConnection });

/**
 * Construct {@link TransactionConnection} variant tagged with {@link TransactionConnectionKind}
 * @param database transaction connection
 * @returns a {@link Connection}
 */
export const transactionConnection = (
  connection: TransactionConnection,
): Connection =>
  Object.assign(connection, { _tag: ConnectionKind.TransactionConnection });
