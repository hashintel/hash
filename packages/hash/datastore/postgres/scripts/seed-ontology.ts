import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { poolConnection } from "packages/hash/api/src/db/postgres/util";

import { createPool, DatabaseTransactionConnection, sql } from "slonik";
import { dataTypes, entityTypes, propertyTypes } from "./data/ontology";

type DBClient = DatabaseTransactionConnection;

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

type DataTypeRow = { data_type_uri: string; schema: any };
const readDataTypes = async (client: DBClient) => {
  return await client.any<DataTypeRow>(sql`select * from data_types`);
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

type PropertyTypeRow = { property_type_uri: string; schema: any };

const readPropertyTypes = async (client: DBClient) => {
  return await client.any<PropertyTypeRow>(sql`select * from property_types`);
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

type PropertyTypePropertyTypeRow = {
  property_type_uri: string;
  referenced_property_type_uri: string;
};

type PropertyTypeDataTypeRow = {
  property_type_uri: string;
  referenced_data_type_uri: string;
};

type PropertyRef = {
  property_type_uri: string;
  referenced: string;
};

const readPropertyTypeReferences = async (
  client: DBClient,
): Promise<PropertyRef[]> => {
  return [
    ...(
      await client.any<PropertyTypePropertyTypeRow>(
        sql`select * from property_type_property_type_references`,
      )
    ).map(({ property_type_uri, referenced_property_type_uri }) => ({
      property_type_uri,
      referenced: referenced_property_type_uri,
    })),
    ...(
      await client.any<PropertyTypeDataTypeRow>(
        sql`select * from property_type_data_type_references`,
      )
    ).map(({ property_type_uri, referenced_data_type_uri }) => ({
      property_type_uri,
      referenced: referenced_data_type_uri,
    })),
  ];
};

const createEntityType = async (
  client: DBClient,
  params: {
    entityTypeUri: string;
    description: string;
  },
) => {
  await client.query(sql`
  insert into entity_types (
    entity_type_uri, description
  )
  values (
    ${params.entityTypeUri},
    ${params.description}
  )
`);
};

type EntityTypeRow = { entity_type_uri: string; description: string };
const readEntityTypes = async (client: DBClient) => {
  return await client.any<EntityTypeRow>(sql`select * from entity_types`);
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
    source_entity_type_uri, property_type_uri, required, "array", min_items, max_items
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

type EntityTypePropertyTypeRow = {
  source_entity_type_uri: string;
  property_type_uri: string;
};

const readEntityTypeReferences = async (client: DBClient) => {
  return client.any<EntityTypePropertyTypeRow>(
    sql`select * from entity_type_property_types`,
  );
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

const lastPartStringified = (str: string) =>
  '"' + str.substring(str.lastIndexOf("/") + 1) + '"';

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
  });

  await pool.transaction(async (client) => {
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

  await pool.transaction(async (client) => {
    const existsEntityType = await client.exists(
      sql`select * from entity_types`,
    );
    if (!existsEntityType) {
      for (const [entityType, dependentPT] of entityTypes) {
        await createEntityType(client, {
          entityTypeUri: entityType.$id,
          description: "",
        });

        await Promise.all(
          dependentPT.map((propertyTypeUri) =>
            entityTypeAddPropertyType(client, {
              sourceEntityTypeUri: entityType.$id,
              propertyTypeUri,
              array: false,
              required: false,
            }),
          ),
        );
      }
    }
  });

  await pool.transaction(async (client) => {
    await printGraph(client);
  });
};

const printGraph = async (client: DatabaseTransactionConnection) => {
  console.info("-- Data Types --");

  const dts = await readDataTypes(client);
  dts.map((row) => console.info(row.data_type_uri));

  console.info("-- Property Types --");
  const pts = await readPropertyTypes(client);
  pts.map((row) => console.info(row.property_type_uri));

  console.info("-- Entity Types --");
  const ets = await readEntityTypes(client);
  ets.map((row) => console.info(row.entity_type_uri));

  console.info(
    "-- Digraph, paste into https://dreampuf.github.io/GraphvizOnline/ --",
  );

  // Close your eyes here. It's ugly, but it works.
  let graph = "digraph G {";
  graph += "subgraph dts {rank=same;node [style=filled,color=lightyellow];";
  dts.map(({ data_type_uri }) => {
    graph += lastPartStringified(data_type_uri) + ";";
  });
  graph += "}";

  graph += "subgraph pts {rank=same;node [style=filled,color=lightblue];";
  pts.map(({ property_type_uri }) => {
    graph += lastPartStringified(property_type_uri) + ";";
  });
  graph += "}";

  graph += "subgraph ets {rank=same;node [style=filled,color=lightpink];";
  ets.map(({ entity_type_uri }) => {
    graph += lastPartStringified(entity_type_uri) + ";";
  });
  graph += "}";

  const ptRefs = await readPropertyTypeReferences(client);
  ptRefs.map(({ property_type_uri, referenced }) => {
    let from = lastPartStringified(property_type_uri);
    let to = lastPartStringified(referenced);

    graph += from + "->" + to + ";";
  });

  const etRefs = await readEntityTypeReferences(client);
  etRefs.map(({ source_entity_type_uri, property_type_uri }) => {
    let from = lastPartStringified(source_entity_type_uri);
    let to = lastPartStringified(property_type_uri);

    graph += from + "->" + to + ";";
  });

  graph += "}";

  console.log(graph);
};

void (async () => {
  await main();
  process.exit(0);
})();
