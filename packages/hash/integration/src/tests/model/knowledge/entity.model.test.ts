import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import {
  EntityModel,
  EntityTypeModel,
  DataTypeModel,
  PropertyTypeModel,
} from "@hashintel/hash-api/src/model";

jest.setTimeout(60000);

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

const graphApi = createGraphClient(
  { basePath: getRequiredEnv("HASH_GRAPH_API_BASE_URL") },
  logger,
);

const accountId = "00000000-0000-0000-0000-000000000000";

const textDataType$id = "https://entity~example.com/data-type/v/1";

const textPropertyTypeBaseId = "https://entity~example.com/property-type-text";
const textPropertyType$id = `${textPropertyTypeBaseId}/v/1`;

const namePropertyTypeBaseId = "https://entity~example.com/property-type-name";
const namePropertyType$id = `${namePropertyTypeBaseId}/v/1`;

const entityType$id = "https://entity~example.com/entity-type-/v/1";

let entityType: EntityTypeModel;

beforeAll(async () => {
  await DataTypeModel.create(graphApi, {
    accountId,
    schema: {
      $id: textDataType$id,
      kind: "dataType",
      title: "Text",
      type: "string",
    },
  });

  const results = await Promise.all([
    EntityTypeModel.create(graphApi, {
      accountId,
      schema: {
        $id: entityType$id,
        kind: "entityType",
        title: "Text",
        type: "object",
        properties: {},
      },
    }),
    PropertyTypeModel.create(graphApi, {
      accountId,
      schema: {
        $id: textPropertyType$id,
        kind: "propertyType",
        title: "Text",
        oneOf: [{ $ref: textDataType$id }],
      },
    }),
    PropertyTypeModel.create(graphApi, {
      accountId,
      schema: {
        $id: namePropertyType$id,
        kind: "propertyType",
        title: "Text",
        oneOf: [{ $ref: textDataType$id }],
      },
    }),
  ]);

  entityType = results[0];
});

describe("Entity CRU", () => {
  let createdEntity: EntityModel;
  it("can create an entity", async () => {
    createdEntity = await EntityModel.create(graphApi, {
      accountId,
      properties: {
        [namePropertyTypeBaseId]: "Bob",
        [textPropertyTypeBaseId]: "some text",
      },
      entityType,
    });
  });

  it("can read an entity", async () => {
    const fetchedEntity = await EntityModel.getLatest(graphApi, {
      accountId,
      entityId: createdEntity.entityId,
    });

    expect(fetchedEntity.entityId).toEqual(createdEntity.entityId);
    expect(fetchedEntity.version).toEqual(createdEntity.version);
  });

  let updatedEntity: EntityModel;
  it("can update an entity", async () => {
    updatedEntity = await createdEntity
      .update(graphApi, {
        accountId,
        properties: {
          [namePropertyTypeBaseId]: "Updated Bob",
          [textPropertyTypeBaseId]: "Even more text than before",
        },
      })
      .catch((err) => Promise.reject(err.data));
  });

  it("can read all latest entities", async () => {
    const allEntities = await EntityModel.getAllLatest(graphApi, {
      accountId,
    });

    const newlyUpdated = allEntities.find(
      (ent) => ent.entityId === updatedEntity.entityId,
    );

    // Even though we've inserted two entities, they're the different versions
    // of the same entity. This should only retrieve a single entity.
    expect(allEntities.length).toEqual(1);
    expect(newlyUpdated).toBeDefined();

    expect(newlyUpdated!.version).toEqual(updatedEntity.version);
    expect((newlyUpdated!.properties as any)[namePropertyTypeBaseId]).toEqual(
      (updatedEntity.properties as any)[namePropertyTypeBaseId],
    );
  });
});
