import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";

import { createPool, DatabaseTransactionConnectionType, sql } from "slonik";

type DBClient = DatabaseTransactionConnectionType;

const createDataType = async (
  client: DBClient,
  params: {
    dataTypeUri: string;
    schema: any;
  },
) => {
  await client.query(sql`
  insert into data_types (
    data_type_uri, schema
  )
  values (
    ${params.dataTypeUri},
    ${sql.jsonb(params.schema)}
  )
`);
};

const createPropertyType = async (
  client: DBClient,
  params: {
    propertyTypeUri: string;
    schema: any;
  },
) => {
  await client.query(sql`
  insert into property_types (
    property_type_uri, schema
  )
  values (
    ${params.propertyTypeUri},
    ${sql.jsonb(params.schema)}
  )
`);
};

const createEntityType = async (
  client: DBClient,
  params: {
    entityTypeUri: string;
    schema: any;
  },
) => {
  await client.query(sql`
  insert into entity_types (
    entity_type_uri, schema
  )
  values (
    ${params.entityTypeUri},
    ${sql.jsonb(params.schema)}
  )
`);
};

const createEntity = async (
  client: DBClient,
  params: {
    entityId: string;
    entityTypeUri: string;
    properties: any;
  },
) => {
  await client.query(sql`
  insert into entity_types (
    entity_id, entity_type_uri, properties
  )
  values (
    ${params.entityId},
    ${params.entityTypeUri},
    ${sql.jsonb(params.properties)}
  )
`);
};

const main = async () => {
  const host = getRequiredEnv("HASH_PG_HOST");
  const user = getRequiredEnv("HASH_PG_USER");
  const database = getRequiredEnv("HASH_PG_DATABASE");
  const password = getRequiredEnv("HASH_PG_PASSWORD");
  const port = parseInt(getRequiredEnv("HASH_PG_PORT"), 10);

  const connStr = `postgresql://${user}:${password}@${host}:${port}/${database}`;

  const pool = createPool(connStr);

  await pool.transaction(async (client) => {
    await createDataType(client, {
      dataTypeUri: "test",
      schema: { hello: "world" },
    });
  });
};

void (async () => {
  await main();
})();
