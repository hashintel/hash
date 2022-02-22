import { transaction } from "./util";
import { ConnectionKind, PoolConnection, TransactionConnection } from "./types";

describe("transaction flattening", () => {
  it("allows a single top-level transaction", async () => {
    const transactionsHandler = jest.fn().mockResolvedValue("ok");
    const transactionConn = {
      ...({} as TransactionConnection),
      transaction: jest.fn(),
    };
    const poolConn = {
      ...({} as PoolConnection),
      _tag: ConnectionKind.PoolConnection,
      transaction: jest
        .fn()
        .mockImplementation((handler) => handler(transactionConn)),
    };

    await transaction(poolConn)(async (conn) => {
      // conn is now equal to `transactionConn`
      // this transactions should never happen.
      return transaction(conn)(async (_) => {
        return transactionsHandler();
      });
    });

    expect(poolConn.transaction).toHaveBeenCalledTimes(1);
    // Transactions should be flattened, so the transaction function on
    // transactionConn should never be called.
    expect(transactionConn.transaction).toHaveBeenCalledTimes(0);
    expect(transactionsHandler).toHaveBeenCalledTimes(1);
  });

  it("runs nested transaction handlers without nesting further", async () => {
    const transactionsHandler = jest.fn().mockResolvedValue("ok");
    const transactionConn = {
      ...({} as TransactionConnection),
      transaction: jest.fn(),
    };
    const poolConn = {
      ...({} as PoolConnection),
      _tag: ConnectionKind.PoolConnection,
      transaction: jest
        .fn()
        .mockImplementation((handler) => handler(transactionConn)),
    };

    await transaction(poolConn)(async (conn) => {
      return transaction(conn)(async (subConn) => {
        await transactionsHandler.call(subConn);
        return transaction(subConn)(async (subSubConn) => {
          await transactionsHandler(subSubConn);
          return transaction(subSubConn)(async (subSubSubConn) => {
            return await transactionsHandler(subSubSubConn);
          });
        });
      });
    });

    expect(poolConn.transaction).toHaveBeenCalledTimes(1);
    expect(transactionConn.transaction).toHaveBeenCalledTimes(0);
    // The nested transactions are all executed, but within the top-level transaction.
    expect(transactionsHandler).toHaveBeenCalledTimes(3);
    expect(transactionsHandler).toHaveBeenCalledWith(transactionConn);
  });
});
