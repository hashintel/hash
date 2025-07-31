import path from "node:path";
import { fileURLToPath } from "node:url";

import { DBSQLClient } from "@databricks/sql";
import type IDBSQLSession from "@databricks/sql/dist/contracts/IDBSQLSession";
import type IOperation from "@databricks/sql/dist/contracts/IOperation";
import type { DBSQLParameterValue } from "@databricks/sql/dist/DBSQLParameter";
import { config } from "dotenv-flow";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const monorepoRootDir = path.resolve(__dirname, "../../../");

config({ silent: true, path: monorepoRootDir });

const serverHostname = process.env.DATABRICKS_SERVER_HOSTNAME;
const httpPath = process.env.DATABRICKS_HTTP_PATH;
const token = process.env.DATABRICKS_TOKEN;

export const getDatabricksClient = async () => {
  if (!token) {
    throw new Error("DATABRICKS_TOKEN is not set");
  }
  if (!serverHostname) {
    throw new Error("DATABRICKS_SERVER_HOSTNAME is not set");
  }
  if (!httpPath) {
    throw new Error("DATABRICKS_HTTP_PATH is not set");
  }

  const client: DBSQLClient = new DBSQLClient();

  const connectOptions = {
    token,
    host: serverHostname,
    path: httpPath,
  };

  await client.connect(connectOptions);

  return {
    client,
    [Symbol.asyncDispose]: async () => {
      await client.close();
    },
  };
};

export const runSqlQueryOnDatabricks = async (
  query: string,
  parameterValues?: DBSQLParameterValue[],
) => {
  await using databricks = await getDatabricksClient();

  const { client } = databricks;

  const session: IDBSQLSession = await client.openSession();

  const queryOperation: IOperation = await session.executeStatement(query, {
    runAsync: true,
    maxRows: 10_000,
    ordinalParameters: parameterValues,
  });

  const result = await queryOperation.fetchAll();

  await queryOperation.close();

  await session.close();

  return result;
};

type TableDefinition = {
  database: string;
  tableName: string;
  isTemporary: boolean;
};

export const getSqlTables = async (): Promise<string[]> => {
  return await runSqlQueryOnDatabricks("SHOW TABLES").then((result) => {
    return result.map((row) => (row as TableDefinition).tableName);
  });
};

export const getSqlTableRows = async (tableName: string) => {
  return await runSqlQueryOnDatabricks(`SELECT * FROM ${tableName}`);
};
