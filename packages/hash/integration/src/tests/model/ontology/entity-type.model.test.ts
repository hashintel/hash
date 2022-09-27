import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import {
  EntityTypeModel,
  DataTypeModel,
  PropertyTypeModel,
  LinkTypeModel,
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

let accountId: string;
let entityTypeSchema: Omit<EntityType, "$id">;
let workerEntityTypeModel: EntityTypeModel;
let textDataTypeModel: DataTypeModel;
let namePropertyTypeModel: PropertyTypeModel;
let favoriteBookPropertyTypeModel: PropertyTypeModel;
let knowsLinkTypeModel: LinkTypeModel;

beforeAll(async () => {
  const testUser = await createTestUser(graphApi, "entity-type-test", logger);

  accountId = testUser.entityId;

  textDataTypeModel = await DataTypeModel.create(graphApi, {
    accountId,
    schema: {
      kind: "dataType",
      title: "Text",
      type: "string",
    },
  });

  await Promise.all([
    EntityTypeModel.create(graphApi, {
      accountId,
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
    PropertyTypeModel.create(graphApi, {
      accountId,
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
      accountId,
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
      accountId,
      schema: {
        kind: "linkType",
        title: "Knows",
        pluralTitle: "Knows",
        description: "Knows of someone",
      },
    }).then((val) => {
      knowsLinkTypeModel = val;
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
          // When adding links in entity type definitions the `$ref` is
          // expected to be another entity type. That other entity type needs
          // to exist in the DB beforehand.
          $ref: workerEntityTypeModel.schema.$id,
        },
        ordered: false,
      },
    },
  };
});

describe("Entity type CRU", () => {
  let createdEntityType: EntityTypeModel;

  it("can create an entity type", async () => {
    createdEntityType = await EntityTypeModel.create(graphApi, {
      accountId,
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
        accountId,
        schema: { ...entityTypeSchema, title: updatedTitle },
      })
      .catch((err) => Promise.reject(err.data));

    updatedId = updatedEntityTypeModel.schema.$id;
  });

  it("can read all latest entity types", async () => {
    const allEntityTypes = await EntityTypeModel.getAllLatest(graphApi, {
      accountId,
    });

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

    expect(linkTypes).toHaveLength(1);

    const linkTypeVersioned$ids = linkTypes.map((lt) => lt.schema.$id);

    expect(linkTypeVersioned$ids).toContain(knowsLinkTypeModel.schema.$id);
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
});
