import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";

import { createPool, DatabaseTransactionConnection, sql } from "slonik";
import { dataTypes, propertyTypes } from "./data/ontology";

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

const readPropertyTypeReferences = async (client: DBClient) => {
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

const lastPart = (str: string) =>
  str.substring(str.lastIndexOf("/") + 1).replace("-", "");

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

  console.info(
    "-- Digraph, paste into https://dreampuf.github.io/GraphvizOnline/ --",
  );

  // Close your eyes here. It's ugly, but it works.
  let graph = "digraph G {";
  graph += "subgraph dts {node [style=filled,color=lightyellow];";
  dts.map(({ data_type_uri }) => {
    graph += lastPart(data_type_uri) + ";";
  });
  graph += "}";

  graph += "subgraph pts {node [style=filled,color=lightblue];";
  pts.map(({ property_type_uri }) => {
    graph += lastPart(property_type_uri) + ";";
  });
  graph += "}";

  const ptRefs = await readPropertyTypeReferences(client);
  ptRefs.map(({ property_type_uri, referenced }) => {
    let from = lastPart(property_type_uri);
    let to = lastPart(referenced);

    graph += from + "->" + to + ";";
  });
  graph += "}";

  console.log(graph);
};

void (async () => {
  await main();
  process.exit(0);
})();
