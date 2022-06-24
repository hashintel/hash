import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";

import { createPool, DatabaseTransactionConnectionType, sql } from "slonik";
import { dataTypes, propertyTypes } from "./data/ontology";

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

const entityTypeAddPropertyType = async (
  client: DBClient,
  params: {
    sourceEntityTypeUri: string;
    propertyTypeUri: string;
    required: boolean;
    array: boolean;
    minItems?: number | null;
    maxItems?: number | null;
  },
) => {
  await client.query(sql`
  insert into entity_type_property_types (
    source_entity_type_uri, property_type_uri, required, array, min_items, max_items
  )
  values (
    ${params.sourceEntityTypeUri},
    ${params.propertyTypeUri},
    ${params.required},
    ${params.array},
    ${params.minItems ?? null},
    ${params.maxItems ?? null}
  )
`);
};

const propertyTypeAddPropertyType = async (
  client: DBClient,
  params: {
    propertyTypeUri: string;
    referencePropertyTypeUri: string;
  },
) => {
  await client.query(sql`
  insert into property_type_property_type_references (
    property_type_uri, referenced_property_type_uri
  )
  values (
    ${params.propertyTypeUri},
    ${params.referencePropertyTypeUri}
  )
`);
};

const propertyTypeAddDataType = async (
  client: DBClient,
  params: {
    propertyTypeUri: string;
    referenceDataTypeUri: string;
  },
) => {
  await client.query(sql`
  insert into property_type_data_type_references (
    property_type_uri, referenced_data_type_uri
  )
  values (
    ${params.propertyTypeUri},
    ${params.referenceDataTypeUri}
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
  insert into entities (
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
    const existsDataTypes = await client.exists(sql`select * from data_types`);
    if (!existsDataTypes) {
      for (const schema of dataTypes) {
        await createDataType(client, { dataTypeUri: schema.$id, schema });
      }
    }

    const existsPropertyTypes = await client.exists(
      sql`select * from property_types`,
    );
    if (!existsPropertyTypes) {
      for (const [propertType, dependentDT, dependentPT] of propertyTypes) {
        await createPropertyType(client, {
          propertyTypeUri: propertType.$id,
          schema: propertType,
        });

        await Promise.all(
          dependentDT.map((referenceDataTypeUri) =>
            propertyTypeAddDataType(client, {
              propertyTypeUri: propertType.$id,
              referenceDataTypeUri,
            }),
          ),
        );

        await Promise.all(
          dependentPT.map((referencePropertyTypeUri) =>
            propertyTypeAddPropertyType(client, {
              propertyTypeUri: propertType.$id,
              referencePropertyTypeUri,
            }),
          ),
        );
      }
    }
  });
};

void (async () => {
  await main();
})();
