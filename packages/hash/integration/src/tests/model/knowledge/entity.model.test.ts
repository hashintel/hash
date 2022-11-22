import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import {
  EntityModel,
  EntityTypeModel,
  DataTypeModel,
  PropertyTypeModel,
  UserModel,
} from "@hashintel/hash-api/src/model";
import {
  generateSystemEntityTypeSchema,
  linkEntityTypeUri,
} from "@hashintel/hash-api/src/model/util";
import { generateTypeId } from "@hashintel/hash-shared/types";
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

describe("Entity CRU", () => {
  let testUser: UserModel;
  let testUser2: UserModel;
  let entityTypeModel: EntityTypeModel;
  let textDataTypeModel: DataTypeModel;
  let namePropertyTypeModel: PropertyTypeModel;
  let favoriteBookPropertyTypeModel: PropertyTypeModel;
  let linkEntityTypeFriendModel: EntityTypeModel;

  beforeAll(async () => {
    testUser = await createTestUser(graphApi, "entitytest", logger);
    testUser2 = await createTestUser(graphApi, "entitytest", logger);

    textDataTypeModel = await DataTypeModel.create(graphApi, {
      ownedById: testUser.entityUuid,
      schema: {
        kind: "dataType",
        title: "Text",
        type: "string",
      },
      actorId: testUser.entityUuid,
    }).catch((err) => {
      logger.error(`Something went wrong making Text: ${err}`);
      throw err;
    });

    await Promise.all([
      EntityTypeModel.create(graphApi, {
        ownedById: testUser.entityUuid,
        schema: {
          kind: "entityType",
          title: "Friends",
          description: "Friend of",
          type: "object",
          properties: {},
          allOf: [{ $ref: linkEntityTypeUri }],
        },
        actorId: testUser.entityUuid,
      })
        .then((val) => {
          linkEntityTypeFriendModel = val;
        })
        .catch((err) => {
          logger.error(`Something went wrong making link type Friends: ${err}`);
          throw err;
        }),

      PropertyTypeModel.create(graphApi, {
        ownedById: testUser.entityUuid,
        schema: {
          kind: "propertyType",
          title: "Favorite Book",
          oneOf: [{ $ref: textDataTypeModel.schema.$id }],
        },
        actorId: testUser.entityUuid,
      })
        .then((val) => {
          favoriteBookPropertyTypeModel = val;
        })
        .catch((err) => {
          logger.error(`Something went wrong making Favorite Book: ${err}`);
          throw err;
        }),
      PropertyTypeModel.create(graphApi, {
        ownedById: testUser.entityUuid,
        schema: {
          kind: "propertyType",
          title: "Name",
          oneOf: [{ $ref: textDataTypeModel.schema.$id }],
        },
        actorId: testUser.entityUuid,
      })
        .then((val) => {
          namePropertyTypeModel = val;
        })
        .catch((err) => {
          logger.error(`Something went wrong making Names: ${err}`);
          throw err;
        }),
    ]);

    entityTypeModel = await EntityTypeModel.create(graphApi, {
      ownedById: testUser.entityUuid,
      schema: generateSystemEntityTypeSchema({
        entityTypeId: generateTypeId({
          namespace: testUser.getShortname()!,
          kind: "entity-type",
          title: "Person",
        }),
        title: "Person",
        properties: [
          { propertyTypeModel: favoriteBookPropertyTypeModel },
          { propertyTypeModel: namePropertyTypeModel },
        ],
        outgoingLinks: [
          {
            linkEntityTypeModel: linkEntityTypeFriendModel,
            destinationEntityTypeModels: ["SELF_REFERENCE"],
          },
        ],
        actorId: testUser.entityUuid,
      }),
      actorId: testUser.entityUuid,
    });
  });

  let createdEntityModel: EntityModel;
  it("can create an entity", async () => {
    createdEntityModel = await EntityModel.create(graphApi, {
      ownedById: testUser.entityUuid,
      properties: {
        [namePropertyTypeModel.baseUri]: "Bob",
        [favoriteBookPropertyTypeModel.baseUri]: "some text",
      },
      entityTypeModel,
      actorId: testUser.entityUuid,
    });
  });

  it("can read an entity", async () => {
    const fetchedEntityModel = await EntityModel.getLatest(graphApi, {
      entityId: createdEntityModel.baseId,
    });

    expect(fetchedEntityModel.baseId).toEqual(createdEntityModel.baseId);
    expect(fetchedEntityModel.version).toEqual(createdEntityModel.version);
  });

  let updatedEntityModel: EntityModel;
  it("can update an entity", async () => {
    expect(createdEntityModel.metadata.provenance.createdById).toBe(
      testUser.entityUuid,
    );
    expect(createdEntityModel.metadata.provenance.updatedById).toBe(
      testUser.entityUuid,
    );

    updatedEntityModel = await createdEntityModel
      .update(graphApi, {
        properties: {
          [namePropertyTypeModel.baseUri]: "Updated Bob",
          [favoriteBookPropertyTypeModel.baseUri]: "Even more text than before",
        },
        actorId: testUser2.entityUuid,
      })
      .catch((err) => Promise.reject(err.data));

    expect(updatedEntityModel.metadata.provenance.createdById).toBe(
      testUser.entityUuid,
    );
    expect(updatedEntityModel.metadata.provenance.updatedById).toBe(
      testUser2.entityUuid,
    );
  });

  it("can read all latest entities", async () => {
    const allEntityModels = (
      await EntityModel.getByQuery(graphApi, {
        all: [{ equal: [{ path: ["version"] }, { parameter: "latest" }] }],
      })
    ).filter((entity) => entity.ownedById === testUser.entityUuid);

    const newlyUpdatedModel = allEntityModels.find(
      (ent) => ent.baseId === updatedEntityModel.baseId,
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

  it("can create entity with linked entities from an entity definition", async () => {
    const aliceEntityModel = await EntityModel.createEntityWithLinks(graphApi, {
      ownedById: testUser.entityUuid,
      // First create a new entity given the following definition
      entityTypeId: entityTypeModel.schema.$id,
      properties: {
        [namePropertyTypeModel.baseUri]: "Alice",
        [favoriteBookPropertyTypeModel.baseUri]: "some text",
      },
      linkedEntities: [
        {
          // Then create an entity + link
          destinationAccountId: testUser.baseId,
          linkEntityTypeId: linkEntityTypeFriendModel.schema.$id,
          entity: {
            // The "new" entity is in fact just an existing entity, so only a link will be created.
            existingEntityId: updatedEntityModel.baseId,
          },
        },
      ],
      actorId: testUser.entityUuid,
    });

    const linkEntityModel = (
      await aliceEntityModel.getOutgoingLinks(graphApi)
    ).map((outgoingLinkEntityModel) => outgoingLinkEntityModel)[0]!;

    expect(linkEntityModel.rightEntityModel.entity).toEqual(
      updatedEntityModel.entity,
    );
    expect(linkEntityModel.metadata.entityTypeId).toEqual(
      linkEntityTypeFriendModel.entityType.schema.$id,
    );
  });
});
