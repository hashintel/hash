import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";

import { createPool, DatabasePoolConnectionType, sql } from "slonik";

type DBClient = DatabasePoolConnectionType;

const createDataType = (
  client: DBClient,
  params: {
    dataTypeUri: string;
    schema: any;
  },
) => {};

const createPropertyType = (
  client: DBClient,
  params: {
    propertyTypeUri: string;
    schema: any;
  },
) => {};

const createEntityType = (
  client: DBClient,
  params: {
    entityTypeUri: string;
    schema: any;
  },
) => {};

const createEntity = (
  client: DBClient,
  params: {
    entity_id: string;
    entity_type_uri: string;
    properties: any;
  },
) => {};

const main = async () => {
  const host = getRequiredEnv("HASH_PG_HOST");
  const user = getRequiredEnv("HASH_PG_USER");
  const database = getRequiredEnv("HASH_PG_DATABASE");
  const password = getRequiredEnv("HASH_PG_PASSWORD");
  const port = parseInt(getRequiredEnv("HASH_PG_PORT"), 10);

  const connStr = `postgresql://${user}:${password}@${host}:${port}/${database}`;

  const pool = createPool(connStr);

  await pool.transaction((client) => {});
};

void (async () => {
  await main();
})();
