import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import {
  EntityModel,
  EntityTypeModel,
  DataTypeModel,
  PropertyTypeModel,
} from "@hashintel/hash-api/src/model";
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
let entityTypeModel: EntityTypeModel;
let textDataTypeModel: DataTypeModel;
let namePropertyTypeModel: PropertyTypeModel;
let favoriteBookPropertyTypeModel: PropertyTypeModel;

beforeAll(async () => {
  const testUser = await createTestUser(graphApi, "entitytest", logger);

  accountId = testUser.entityId;

  textDataTypeModel = await DataTypeModel.create(graphApi, {
    accountId,
    schema: {
      kind: "dataType",
      title: "Text",
      type: "string",
    },
  }).catch((err) => {
    logger.error(`Something went wrong making Text: ${err}`);
    throw err;
  });

  const results = await Promise.all([
    EntityTypeModel.create(graphApi, {
      accountId,
      schema: {
        kind: "entityType",
        title: "Person",
        pluralTitle: "People",
        type: "object",
        properties: {},
      },
    }).catch((err) => {
      logger.error(`Something went wrong making Person: ${err}`);
      throw err;
    }),
    PropertyTypeModel.create(graphApi, {
      accountId,
      schema: {
        kind: "propertyType",
        title: "Favorite Book",
        pluralTitle: "Favorite Books",
        oneOf: [{ $ref: textDataTypeModel.schema.$id }],
      },
    })
      .then((val) => {
        favoriteBookPropertyTypeModel = val;
      })
      .catch((err) => {
        logger.error(`Something went wrong making Favorite Book: ${err}`);
        throw err;
      }),
    PropertyTypeModel.create(graphApi, {
      accountId,
      schema: {
        kind: "propertyType",
        title: "Name",
        pluralTitle: "Names",
        oneOf: [{ $ref: textDataTypeModel.schema.$id }],
      },
    })
      .then((val) => {
        namePropertyTypeModel = val;
      })
      .catch((err) => {
        logger.error(`Something went wrong making Names: ${err}`);
        throw err;
      }),
  ]);

  entityTypeModel = results[0];
});

describe("Entity CRU", () => {
  let createdEntityModel: EntityModel;
  it("can create an entity", async () => {
    createdEntityModel = await EntityModel.create(graphApi, {
      accountId,
      properties: {
        [namePropertyTypeModel.baseUri]: "Bob",
        [favoriteBookPropertyTypeModel.baseUri]: "some text",
      },
      entityTypeModel,
    });
  });

  it("can read an entity", async () => {
    const fetchedEntityModel = await EntityModel.getLatest(graphApi, {
      accountId,
      entityId: createdEntityModel.entityId,
    });

    expect(fetchedEntityModel.entityId).toEqual(createdEntityModel.entityId);
    expect(fetchedEntityModel.version).toEqual(createdEntityModel.version);
  });

  let updatedEntityModel: EntityModel;
  it("can update an entity", async () => {
    updatedEntityModel = await createdEntityModel
      .update(graphApi, {
        accountId,
        properties: {
          [namePropertyTypeModel.baseUri]: "Updated Bob",
          [favoriteBookPropertyTypeModel.baseUri]: "Even more text than before",
        },
      })
      .catch((err) => Promise.reject(err.data));
  });

  it("can read all latest entities", async () => {
    const allEntityModels = (
      await EntityModel.getByQuery(graphApi, {
        all: [{ eq: [{ path: ["version"] }, { literal: "latest" }] }],
      })
    ).filter((entity) => entity.accountId === accountId);

    const newlyUpdatedModel = allEntityModels.find(
      (ent) => ent.entityId === updatedEntityModel.entityId,
    );

    // Even though we've inserted two entities, they're the different versions
    // of the same entity. This should only retrieve a single entity.
    // Other tests pollute the database, though, so we can't rely on this test's
    // results in isolation.
    expect(allEntityModels.length).toBeGreaterThanOrEqual(1);
    expect(newlyUpdatedModel).toBeDefined();

    expect(newlyUpdatedModel!.version).toEqual(updatedEntityModel.version);
    expect(
      (newlyUpdatedModel!.properties as any)[namePropertyTypeModel.baseUri],
    ).toEqual(
      (updatedEntityModel.properties as any)[namePropertyTypeModel.baseUri],
    );
  });
});
