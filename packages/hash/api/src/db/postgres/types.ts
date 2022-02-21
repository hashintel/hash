import {
  DatabasePoolConnectionType,
  DatabaseTransactionConnectionType,
} from "slonik";

export type PoolConnectionKind = "PoolConnectionKind";
export type TransactionConnectionKind = "TransactionConnection";

/**
 * The types given for different connection kinds cannot be used as values directly.
 * This object maps the connection kind to its desired type.
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

export type Tag<Typ, UnionTag> = Typ & { _tag: UnionTag };

export type Connection =
  | Tag<PoolConnection, PoolConnectionKind>
  | Tag<TransactionConnection, TransactionConnectionKind>;

export const poolConnection = (connection: PoolConnection): Connection =>
  Object.assign(connection, { _tag: ConnectionKind.PoolConnection });

export const transactionConnection = (
  connection: TransactionConnection,
): Connection =>
  Object.assign(connection, { _tag: ConnectionKind.TransactionConnection });
