import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import {
  EntityModel,
  EntityTypeModel,
  DataTypeModel,
  PropertyTypeModel,
  LinkTypeModel,
  UserModel,
} from "@hashintel/hash-api/src/model";
import { generateWorkspaceEntityTypeSchema } from "@hashintel/hash-api/src/model/util";
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
  let linkTypeFriend: LinkTypeModel;

  beforeAll(async () => {
    testUser = await createTestUser(graphApi, "entitytest", logger);
    testUser2 = await createTestUser(graphApi, "entitytest", logger);

    textDataTypeModel = await DataTypeModel.create(graphApi, {
      ownedById: testUser.entityId,
      schema: {
        kind: "dataType",
        title: "Text",
        type: "string",
      },
      actorId: testUser.entityId,
    }).catch((err) => {
      logger.error(`Something went wrong making Text: ${err}`);
      throw err;
    });

    await Promise.all([
      LinkTypeModel.create(graphApi, {
        ownedById: testUser.entityId,
        schema: {
          kind: "linkType",
          title: "Friends",
          description: "Friend of",
        },
        actorId: testUser.entityId,
      })
        .then((val) => {
          linkTypeFriend = val;
        })
        .catch((err) => {
          logger.error(`Something went wrong making link type Friends: ${err}`);
          throw err;
        }),

      PropertyTypeModel.create(graphApi, {
        ownedById: testUser.entityId,
        schema: {
          kind: "propertyType",
          title: "Favorite Book",
          oneOf: [{ $ref: textDataTypeModel.schema.$id }],
        },
        actorId: testUser.entityId,
      })
        .then((val) => {
          favoriteBookPropertyTypeModel = val;
        })
        .catch((err) => {
          logger.error(`Something went wrong making Favorite Book: ${err}`);
          throw err;
        }),
      PropertyTypeModel.create(graphApi, {
        ownedById: testUser.entityId,
        schema: {
          kind: "propertyType",
          title: "Name",
          oneOf: [{ $ref: textDataTypeModel.schema.$id }],
        },
        actorId: testUser.entityId,
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
      ownedById: testUser.entityId,
      schema: generateWorkspaceEntityTypeSchema({
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
            linkTypeModel: linkTypeFriend,
            destinationEntityTypeModels: ["SELF_REFERENCE"],
            array: true,
          },
        ],
        actorId: testUser.entityId,
      }),
      actorId: testUser.entityId,
    });
  });

  let createdEntityModel: EntityModel;
  it("can create an entity", async () => {
    createdEntityModel = await EntityModel.create(graphApi, {
      ownedById: testUser.entityId,
      properties: {
        [namePropertyTypeModel.baseUri]: "Bob",
        [favoriteBookPropertyTypeModel.baseUri]: "some text",
      },
      entityTypeModel,
      actorId: testUser.entityId,
    });
  });

  it("can read an entity", async () => {
    const fetchedEntityModel = await EntityModel.getLatest(graphApi, {
      entityId: createdEntityModel.entityId,
    });

    expect(fetchedEntityModel.entityId).toEqual(createdEntityModel.entityId);
    expect(fetchedEntityModel.version).toEqual(createdEntityModel.version);
  });

  let updatedEntityModel: EntityModel;
  it("can update an entity", async () => {
    expect(createdEntityModel.createdById).toBe(testUser.entityId);
    expect(createdEntityModel.updatedById).toBe(testUser.entityId);

    updatedEntityModel = await createdEntityModel
      .update(graphApi, {
        properties: {
          [namePropertyTypeModel.baseUri]: "Updated Bob",
          [favoriteBookPropertyTypeModel.baseUri]: "Even more text than before",
        },
        actorId: testUser2.entityId,
      })
      .catch((err) => Promise.reject(err.data));

    expect(updatedEntityModel.createdById).toBe(testUser.entityId);
    expect(updatedEntityModel.updatedById).toBe(testUser2.entityId);
  });

  it("can read all latest entities", async () => {
    const allEntityModels = (
      await EntityModel.getByQuery(graphApi, {
        all: [{ equal: [{ path: ["version"] }, { parameter: "latest" }] }],
      })
    ).filter((entity) => entity.ownedById === testUser.entityId);

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

  it("can create entity with linked entities from an entity definition", async () => {
    const aliceEntityModel = await EntityModel.createEntityWithLinks(graphApi, {
      ownedById: testUser.entityId,
      // First create a new entity given the following definition
      entityTypeId: entityTypeModel.schema.$id,
      properties: {
        [namePropertyTypeModel.baseUri]: "Alice",
        [favoriteBookPropertyTypeModel.baseUri]: "some text",
      },
      linkedEntities: [
        {
          // Then create an entity + link
          destinationAccountId: testUser.entityId,
          linkTypeId: linkTypeFriend.schema.$id,
          entity: {
            // The "new" entity is in fact just an existing entity, so only a link will be created.
            existingEntity: {
              entityId: updatedEntityModel.entityId,
              ownedById: updatedEntityModel.ownedById,
            },
          },
        },
      ],
      actorId: testUser.entityId,
    });

    const linkedEntity = (
      await aliceEntityModel.getOutgoingLinks(graphApi)
    ).map((linkModel) => linkModel)[0]!;

    expect(linkedEntity.targetEntityModel).toEqual(updatedEntityModel);
    expect(linkedEntity.linkTypeModel).toEqual(linkTypeFriend);
  });
});
