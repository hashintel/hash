import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import {
  EntityTypeModel,
  DataTypeModel,
  PropertyTypeModel,
  LinkTypeModel,
  UserModel,
} from "@hashintel/hash-api/src/model";
import { EntityType } from "@blockprotocol/type-system-web";
import { createTestUser } from "../../util";

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
let workerEntityTypeModel: EntityTypeModel;
let textDataTypeModel: DataTypeModel;
let namePropertyTypeModel: PropertyTypeModel;
let favoriteBookPropertyTypeModel: PropertyTypeModel;
let knowsLinkTypeModel: LinkTypeModel;
let previousAddressLinkTypeModel: LinkTypeModel;
let addressEntityTypeModel: EntityTypeModel;

beforeAll(async () => {
  testUser = await createTestUser(graphApi, "entity-type-test-1", logger);
  testUser2 = await createTestUser(graphApi, "entity-type-test-2", logger);

  textDataTypeModel = await DataTypeModel.create(graphApi, {
    ownedById: testUser.entityId,
    schema: {
      kind: "dataType",
      title: "Text",
      type: "string",
    },
    actorId: testUser.entityId,
  });

  await Promise.all([
    EntityTypeModel.create(graphApi, {
      ownedById: testUser.entityId,
      schema: {
        kind: "entityType",
        title: "Worker",
        type: "object",
        properties: {},
      },
      actorId: testUser.entityId,
    }).then((val) => {
      workerEntityTypeModel = val;
    }),
    EntityTypeModel.create(graphApi, {
      ownedById: testUser.entityId,
      schema: {
        kind: "entityType",
        title: "Address",
        type: "object",
        properties: {},
      },
      actorId: testUser.entityId,
    }).then((val) => {
      addressEntityTypeModel = val;
    }),
    PropertyTypeModel.create(graphApi, {
      ownedById: testUser.entityId,
      schema: {
        kind: "propertyType",
        title: "Favorite Book",
        oneOf: [{ $ref: textDataTypeModel.schema.$id }],
      },
      actorId: testUser.entityId,
    }).then((val) => {
      favoriteBookPropertyTypeModel = val;
    }),
    PropertyTypeModel.create(graphApi, {
      ownedById: testUser.entityId,
      schema: {
        kind: "propertyType",
        title: "Name",
        oneOf: [{ $ref: textDataTypeModel.schema.$id }],
      },
      actorId: testUser.entityId,
    }).then((val) => {
      namePropertyTypeModel = val;
    }),
    LinkTypeModel.create(graphApi, {
      ownedById: testUser.entityId,
      schema: {
        kind: "linkType",
        title: "Knows",
        description: "Knows of someone",
      },
      actorId: testUser.entityId,
    }).then((val) => {
      knowsLinkTypeModel = val;
    }),
    LinkTypeModel.create(graphApi, {
      ownedById: testUser.entityId,
      schema: {
        kind: "linkType",
        title: "Previous Address",
        description: "A previous address of something.",
      },
      actorId: testUser.entityId,
    }).then((val) => {
      previousAddressLinkTypeModel = val;
    }),
  ]);

  entityTypeSchema = {
    kind: "entityType",
    title: "Some",
    type: "object",
    properties: {
      [favoriteBookPropertyTypeModel.baseUri]: {
        $ref: favoriteBookPropertyTypeModel.schema.$id,
      },
      [namePropertyTypeModel.baseUri]: {
        $ref: namePropertyTypeModel.schema.$id,
      },
    },
    links: {
      [knowsLinkTypeModel.schema.$id]: {
        type: "array",
        items: {
          oneOf: [{ $ref: workerEntityTypeModel.schema.$id }],
        },
        ordered: false,
      },
      [previousAddressLinkTypeModel.schema.$id]: {
        type: "array",
        items: {
          oneOf: [{ $ref: addressEntityTypeModel.schema.$id }],
        },
        ordered: true,
      },
    },
  };
});

describe("Entity type CRU", () => {
  let createdEntityType: EntityTypeModel;

  it("can create an entity type", async () => {
    createdEntityType = await EntityTypeModel.create(graphApi, {
      ownedById: testUser.entityId,
      schema: entityTypeSchema,
      actorId: testUser.entityId,
    });
  });

  it("can read an entity type", async () => {
    const fetchedEntityType = await EntityTypeModel.get(graphApi, {
      entityTypeId: createdEntityType.schema.$id,
    });

    expect(fetchedEntityType.schema).toEqual(createdEntityType.schema);
  });

  const updatedTitle = "New text!";
  let updatedId: string | undefined;
  it("can update an entity type", async () => {
    expect(createdEntityType.createdById).toBe(testUser.entityId);
    expect(createdEntityType.updatedById).toBe(testUser.entityId);

    const updatedEntityTypeModel = await createdEntityType
      .update(graphApi, {
        schema: { ...entityTypeSchema, title: updatedTitle },
        actorId: testUser2.entityId,
      })
      .catch((err) => Promise.reject(err.data));

    expect(updatedEntityTypeModel.createdById).toBe(testUser.entityId);
    expect(updatedEntityTypeModel.updatedById).toBe(testUser2.entityId);

    updatedId = updatedEntityTypeModel.schema.$id;
  });

  it("can read all latest entity types", async () => {
    const allEntityTypes = await EntityTypeModel.getAllLatest(graphApi);

    const newlyUpdated = allEntityTypes.find(
      (dt) => dt.schema.$id === updatedId,
    );

    expect(allEntityTypes.length).toBeGreaterThan(0);
    expect(newlyUpdated).toBeDefined();

    expect(newlyUpdated!.schema.$id).toEqual(updatedId);
    expect(newlyUpdated!.schema.title).toEqual(updatedTitle);
  });

  it("can get all outgoing link types", async () => {
    const linkTypes = await createdEntityType.getOutgoingLinkTypes(graphApi);

    expect(linkTypes).toHaveLength(2);

    expect(linkTypes).toContainEqual(knowsLinkTypeModel);
    expect(linkTypes).toContainEqual(previousAddressLinkTypeModel);
  });

  it("can get all property types", async () => {
    const propertyTypes = await createdEntityType.getPropertyTypes(graphApi);

    expect(propertyTypes).toHaveLength(2);

    const propertyTypeVersioned$ids = propertyTypes.map((pt) => pt.schema.$id);

    expect(propertyTypeVersioned$ids).toContain(
      namePropertyTypeModel.schema.$id,
    );
    expect(propertyTypeVersioned$ids).toContain(
      favoriteBookPropertyTypeModel.schema.$id,
    );
  });

  it("can check whether an outgoing link is ordered", async () => {
    expect(
      createdEntityType.isOutgoingLinkOrdered({
        outgoingLinkType: knowsLinkTypeModel,
      }),
    ).toBe(false);
    expect(
      createdEntityType.isOutgoingLinkOrdered({
        outgoingLinkType: previousAddressLinkTypeModel,
      }),
    ).toBe(true);
  });
});
