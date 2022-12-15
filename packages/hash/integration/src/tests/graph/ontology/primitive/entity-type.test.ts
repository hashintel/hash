import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import {
  createGraphClient,
  ensureSystemGraphIsInitialized,
} from "@hashintel/hash-api/src/graph";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import { UserModel } from "@hashintel/hash-api/src/model";
import { EntityType, TypeSystemInitializer } from "@blockprotocol/type-system";
import { linkEntityTypeUri } from "@hashintel/hash-api/src/model/util";
import {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@hashintel/hash-subgraph";
import { createDataType } from "@hashintel/hash-api/src/graph/ontology/primitive/data-type";
import {
  createEntityType,
  getEntityTypeById,
  updateEntityType,
} from "@hashintel/hash-api/src/graph/ontology/primitive/entity-type";
import { createPropertyType } from "@hashintel/hash-api/src/graph/ontology/primitive/property-type";
import { createTestUser } from "../../../util";

jest.setTimeout(60000);

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

const graphApiHost = getRequiredEnv("HASH_GRAPH_API_HOST");
const graphApiPort = parseInt(getRequiredEnv("HASH_GRAPH_API_PORT"), 10);

const graphApi = createGraphClient(logger, {
  host: graphApiHost,
  port: graphApiPort,
});

let testUser: UserModel;
let testUser2: UserModel;
let entityTypeSchema: Omit<EntityType, "$id">;
let workerEntityType: EntityTypeWithMetadata;
let textDataType: DataTypeWithMetadata;
let namePropertyType: PropertyTypeWithMetadata;
let favoriteBookPropertyType: PropertyTypeWithMetadata;
let knowsLinkEntityType: EntityTypeWithMetadata;
let previousAddressLinkEntityType: EntityTypeWithMetadata;
let addressEntityType: EntityTypeWithMetadata;

beforeAll(async () => {
  await TypeSystemInitializer.initialize();
  await ensureSystemGraphIsInitialized({ graphApi, logger });

  testUser = await createTestUser(graphApi, "entity-type-test-1", logger);
  testUser2 = await createTestUser(graphApi, "entity-type-test-2", logger);

  textDataType = await createDataType(
    { graphApi },
    {
      ownedById: testUser.getEntityUuid(),
      schema: {
        kind: "dataType",
        title: "Text",
        type: "string",
      },
      actorId: testUser.getEntityUuid(),
    },
  );

  await Promise.all([
    createEntityType(
      { graphApi },
      {
        ownedById: testUser.getEntityUuid(),
        schema: {
          kind: "entityType",
          title: "Worker",
          type: "object",
          properties: {},
        },
        actorId: testUser.getEntityUuid(),
      },
    ).then((val) => {
      workerEntityType = val;
    }),
    createEntityType(
      { graphApi },
      {
        ownedById: testUser.getEntityUuid(),
        schema: {
          kind: "entityType",
          title: "Address",
          type: "object",
          properties: {},
        },
        actorId: testUser.getEntityUuid(),
      },
    ).then((val) => {
      addressEntityType = val;
    }),
    createPropertyType(
      { graphApi },
      {
        ownedById: testUser.getEntityUuid(),
        schema: {
          kind: "propertyType",
          title: "Favorite Book",
          oneOf: [{ $ref: textDataType.schema.$id }],
        },
        actorId: testUser.getEntityUuid(),
      },
    ).then((val) => {
      favoriteBookPropertyType = val;
    }),
    createPropertyType(
      { graphApi },
      {
        ownedById: testUser.getEntityUuid(),
        schema: {
          kind: "propertyType",
          title: "Name",
          oneOf: [{ $ref: textDataType.schema.$id }],
        },
        actorId: testUser.getEntityUuid(),
      },
    ).then((val) => {
      namePropertyType = val;
    }),
    createEntityType(
      { graphApi },
      {
        ownedById: testUser.getEntityUuid(),
        schema: {
          kind: "entityType",
          title: "Knows",
          description: "Knows of someone",
          type: "object",
          properties: {},
          allOf: [{ $ref: linkEntityTypeUri }],
        },
        actorId: testUser.getEntityUuid(),
      },
    ).then((val) => {
      knowsLinkEntityType = val;
    }),
    createEntityType(
      { graphApi },
      {
        ownedById: testUser.getEntityUuid(),
        schema: {
          kind: "entityType",
          title: "Previous Address",
          description: "A previous address of something.",
          type: "object",
          properties: {},
          allOf: [{ $ref: linkEntityTypeUri }],
        },
        actorId: testUser.getEntityUuid(),
      },
    ).then((val) => {
      previousAddressLinkEntityType = val;
    }),
  ]);

  entityTypeSchema = {
    kind: "entityType",
    title: "Some",
    type: "object",
    properties: {
      [favoriteBookPropertyType.metadata.editionId.baseId]: {
        $ref: favoriteBookPropertyType.schema.$id,
      },
      [namePropertyType.metadata.editionId.baseId]: {
        $ref: namePropertyType.schema.$id,
      },
    },
    links: {
      [knowsLinkEntityType.schema.$id]: {
        type: "array",
        items: {
          oneOf: [{ $ref: workerEntityType.schema.$id }],
        },
        ordered: false,
      },
      [previousAddressLinkEntityType.schema.$id]: {
        type: "array",
        items: {
          oneOf: [{ $ref: addressEntityType.schema.$id }],
        },
        ordered: true,
      },
    },
  };
});

describe("Entity type CRU", () => {
  let createdEntityType: EntityTypeWithMetadata;

  it("can create an entity type", async () => {
    createdEntityType = await createEntityType(
      { graphApi },
      {
        ownedById: testUser.getEntityUuid(),
        schema: entityTypeSchema,
        actorId: testUser.getEntityUuid(),
      },
    );
  });

  it("can read an entity type", async () => {
    const fetchedEntityType = await getEntityTypeById(
      { graphApi },
      {
        entityTypeId: createdEntityType.schema.$id,
      },
    );

    expect(fetchedEntityType.schema).toEqual(createdEntityType.schema);
  });

  const updatedTitle = "New text!";

  it("can update an entity type", async () => {
    expect(createdEntityType.metadata.provenance.updatedById).toBe(
      testUser.getEntityUuid(),
    );

    const updatedEntityType = await updateEntityType(
      { graphApi },
      {
        entityTypeId: createdEntityType.schema.$id,
        schema: { ...entityTypeSchema, title: updatedTitle },
        actorId: testUser2.getEntityUuid(),
      },
    ).catch((err) => Promise.reject(err.data));

    expect(updatedEntityType.metadata.provenance.updatedById).toBe(
      testUser2.getEntityUuid(),
    );
  });
});
