import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import {
  EntityTypeModel,
  DataTypeModel,
  PropertyTypeModel,
  LinkTypeModel,
} from "@hashintel/hash-api/src/model";
import { EntityType } from "@blockprotocol/type-system";
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

let ownedById: string;
let entityTypeSchema: Omit<EntityType, "$id">;
let workerEntityTypeModel: EntityTypeModel;
let textDataTypeModel: DataTypeModel;
let namePropertyTypeModel: PropertyTypeModel;
let favoriteBookPropertyTypeModel: PropertyTypeModel;
let knowsLinkTypeModel: LinkTypeModel;
let previousAddressLinkTypeModel: LinkTypeModel;
let addressEntityTypeModel: EntityTypeModel;

beforeAll(async () => {
  const testUser = await createTestUser(graphApi, "entity-type-test", logger);

  ownedById = testUser.entityId;

  textDataTypeModel = await DataTypeModel.create(graphApi, {
    ownedById,
    schema: {
      kind: "dataType",
      title: "Text",
      type: "string",
    },
  });

  await Promise.all([
    EntityTypeModel.create(graphApi, {
      ownedById,
      schema: {
        kind: "entityType",
        title: "Worker",
        pluralTitle: "Workers",
        type: "object",
        properties: {},
      },
    }).then((val) => {
      workerEntityTypeModel = val;
    }),
    EntityTypeModel.create(graphApi, {
      ownedById,
      schema: {
        kind: "entityType",
        title: "Address",
        pluralTitle: "Addresses",
        type: "object",
        properties: {},
      },
    }).then((val) => {
      addressEntityTypeModel = val;
    }),
    PropertyTypeModel.create(graphApi, {
      ownedById,
      schema: {
        kind: "propertyType",
        title: "Favorite Book",
        pluralTitle: "Favorite Books",
        oneOf: [{ $ref: textDataTypeModel.schema.$id }],
      },
    }).then((val) => {
      favoriteBookPropertyTypeModel = val;
    }),
    PropertyTypeModel.create(graphApi, {
      ownedById,
      schema: {
        kind: "propertyType",
        title: "Name",
        pluralTitle: "Names",
        oneOf: [{ $ref: textDataTypeModel.schema.$id }],
      },
    }).then((val) => {
      namePropertyTypeModel = val;
    }),
    LinkTypeModel.create(graphApi, {
      ownedById,
      schema: {
        kind: "linkType",
        title: "Knows",
        pluralTitle: "Knows",
        description: "Knows of someone",
      },
    }).then((val) => {
      knowsLinkTypeModel = val;
    }),
    LinkTypeModel.create(graphApi, {
      ownedById,
      schema: {
        kind: "linkType",
        title: "Previous Address",
        pluralTitle: "Previous Addresses",
        description: "A previous address of something.",
      },
    }).then((val) => {
      previousAddressLinkTypeModel = val;
    }),
  ]);

  entityTypeSchema = {
    kind: "entityType",
    title: "Some",
    pluralTitle: "Text",
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
      ownedById,
      schema: entityTypeSchema,
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
    const updatedEntityTypeModel = await createdEntityType
      .update(graphApi, {
        schema: { ...entityTypeSchema, title: updatedTitle },
      })
      .catch((err) => Promise.reject(err.data));

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
