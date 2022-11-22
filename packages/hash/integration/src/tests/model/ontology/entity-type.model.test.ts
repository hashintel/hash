import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import {
  EntityTypeModel,
  DataTypeModel,
  PropertyTypeModel,
  UserModel,
} from "@hashintel/hash-api/src/model";
import { EntityType } from "@blockprotocol/type-system-web";
import { linkEntityTypeUri } from "@hashintel/hash-api/src/model/util";
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
let knowsLinkEntityTypeModel: EntityTypeModel;
let previousAddressLinkEntityTypeModel: EntityTypeModel;
let addressEntityTypeModel: EntityTypeModel;

beforeAll(async () => {
  testUser = await createTestUser(graphApi, "entity-type-test-1", logger);
  testUser2 = await createTestUser(graphApi, "entity-type-test-2", logger);

  textDataTypeModel = await DataTypeModel.create(graphApi, {
    ownedById: testUser.getEntityUuid(),
    schema: {
      kind: "dataType",
      title: "Text",
      type: "string",
    },
    actorId: testUser.getEntityUuid(),
  });

  await Promise.all([
    EntityTypeModel.create(graphApi, {
      ownedById: testUser.getEntityUuid(),
      schema: {
        kind: "entityType",
        title: "Worker",
        type: "object",
        properties: {},
      },
      actorId: testUser.getEntityUuid(),
    }).then((val) => {
      workerEntityTypeModel = val;
    }),
    EntityTypeModel.create(graphApi, {
      ownedById: testUser.getEntityUuid(),
      schema: {
        kind: "entityType",
        title: "Address",
        type: "object",
        properties: {},
      },
      actorId: testUser.getEntityUuid(),
    }).then((val) => {
      addressEntityTypeModel = val;
    }),
    PropertyTypeModel.create(graphApi, {
      ownedById: testUser.getEntityUuid(),
      schema: {
        kind: "propertyType",
        title: "Favorite Book",
        oneOf: [{ $ref: textDataTypeModel.getSchema().$id }],
      },
      actorId: testUser.getEntityUuid(),
    }).then((val) => {
      favoriteBookPropertyTypeModel = val;
    }),
    PropertyTypeModel.create(graphApi, {
      ownedById: testUser.getEntityUuid(),
      schema: {
        kind: "propertyType",
        title: "Name",
        oneOf: [{ $ref: textDataTypeModel.getSchema().$id }],
      },
      actorId: testUser.getEntityUuid(),
    }).then((val) => {
      namePropertyTypeModel = val;
    }),
    EntityTypeModel.create(graphApi, {
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
    }).then((val) => {
      knowsLinkEntityTypeModel = val;
    }),
    EntityTypeModel.create(graphApi, {
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
    }).then((val) => {
      previousAddressLinkEntityTypeModel = val;
    }),
  ]);

  entityTypeSchema = {
    kind: "entityType",
    title: "Some",
    type: "object",
    properties: {
      [favoriteBookPropertyTypeModel.getBaseUri()]: {
        $ref: favoriteBookPropertyTypeModel.getSchema().$id,
      },
      [namePropertyTypeModel.getBaseUri()]: {
        $ref: namePropertyTypeModel.getSchema().$id,
      },
    },
    links: {
      [knowsLinkEntityTypeModel.getSchema().$id]: {
        type: "array",
        items: {
          oneOf: [{ $ref: workerEntityTypeModel.getSchema().$id }],
        },
        ordered: false,
      },
      [previousAddressLinkEntityTypeModel.getSchema().$id]: {
        type: "array",
        items: {
          oneOf: [{ $ref: addressEntityTypeModel.getSchema().$id }],
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
      ownedById: testUser.getEntityUuid(),
      schema: entityTypeSchema,
      actorId: testUser.getEntityUuid(),
    });
  });

  it("can read an entity type", async () => {
    const fetchedEntityType = await EntityTypeModel.get(graphApi, {
      entityTypeId: createdEntityType.getSchema().$id,
    });

    expect(fetchedEntityType.getSchema()).toEqual(
      createdEntityType.getSchema(),
    );
  });

  const updatedTitle = "New text!";
  let updatedId: string | undefined;
  it("can update an entity type", async () => {
    expect(createdEntityType.getMetadata().provenance.createdById).toBe(
      testUser.getEntityUuid(),
    );
    expect(createdEntityType.getMetadata().provenance.updatedById).toBe(
      testUser.getEntityUuid(),
    );

    const updatedEntityTypeModel = await createdEntityType
      .update(graphApi, {
        schema: { ...entityTypeSchema, title: updatedTitle },
        actorId: testUser2.getEntityUuid(),
      })
      .catch((err) => Promise.reject(err.data));

    expect(updatedEntityTypeModel.getMetadata().provenance.createdById).toBe(
      testUser.getEntityUuid(),
    );
    expect(updatedEntityTypeModel.getMetadata().provenance.updatedById).toBe(
      testUser2.getEntityUuid(),
    );

    updatedId = updatedEntityTypeModel.getSchema().$id;
  });

  it("can read all latest entity types", async () => {
    const allEntityTypes = await EntityTypeModel.getAllLatest(graphApi);

    const newlyUpdated = allEntityTypes.find(
      (dt) => dt.getSchema().$id === updatedId,
    );

    expect(allEntityTypes.length).toBeGreaterThan(0);
    expect(newlyUpdated).toBeDefined();

    expect(newlyUpdated!.getSchema().$id).toEqual(updatedId);
    expect(newlyUpdated!.getSchema().title).toEqual(updatedTitle);
  });

  it("can get all outgoing link types", async () => {
    const linkTypes = await createdEntityType.getOutgoingLinkEntityTypes(
      graphApi,
    );

    expect(linkTypes).toHaveLength(2);

    expect(linkTypes).toContainEqual(knowsLinkEntityTypeModel);
    expect(linkTypes).toContainEqual(previousAddressLinkEntityTypeModel);
  });

  it("can get all property types", async () => {
    const propertyTypes = await createdEntityType.getPropertyTypes(graphApi);

    expect(propertyTypes).toHaveLength(2);

    const propertyTypeVersioned$ids = propertyTypes.map(
      (pt) => pt.getSchema().$id,
    );

    expect(propertyTypeVersioned$ids).toContain(
      namePropertyTypeModel.getSchema().$id,
    );
    expect(propertyTypeVersioned$ids).toContain(
      favoriteBookPropertyTypeModel.getSchema().$id,
    );
  });

  it("can check whether an outgoing link is ordered", async () => {
    expect(
      createdEntityType.isOutgoingLinkOrdered({
        outgoingLinkEntityType: knowsLinkEntityTypeModel,
      }),
    ).toBe(false);
    expect(
      createdEntityType.isOutgoingLinkOrdered({
        outgoingLinkEntityType: previousAddressLinkEntityTypeModel,
      }),
    ).toBe(true);
  });
});
