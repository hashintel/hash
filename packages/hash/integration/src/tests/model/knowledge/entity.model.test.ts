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
import { ensureSystemEntitiesExists } from "@hashintel/hash-api/src/graph/system-entities";
import { ensureSystemTypesExist } from "@hashintel/hash-api/src/graph/system-types";
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
    await ensureSystemTypesExist({ graphApi, logger });
    await ensureSystemEntitiesExists({ graphApi, logger });

    testUser = await createTestUser(graphApi, "entitytest", logger);
    testUser2 = await createTestUser(graphApi, "entitytest", logger);

    textDataTypeModel = await DataTypeModel.create(graphApi, {
      ownedById: testUser.getEntityUuid(),
      schema: {
        kind: "dataType",
        title: "Text",
        type: "string",
      },
      actorId: testUser.getEntityUuid(),
    }).catch((err) => {
      logger.error(`Something went wrong making Text: ${err}`);
      throw err;
    });

    await Promise.all([
      EntityTypeModel.create(graphApi, {
        ownedById: testUser.getEntityUuid(),
        schema: {
          kind: "entityType",
          title: "Friends",
          description: "Friend of",
          type: "object",
          properties: {},
          allOf: [{ $ref: linkEntityTypeUri }],
        },
        actorId: testUser.getEntityUuid(),
      })
        .then((val) => {
          linkEntityTypeFriendModel = val;
        })
        .catch((err) => {
          logger.error(`Something went wrong making link type Friends: ${err}`);
          throw err;
        }),

      PropertyTypeModel.create(graphApi, {
        ownedById: testUser.getEntityUuid(),
        schema: {
          kind: "propertyType",
          title: "Favorite Book",
          oneOf: [{ $ref: textDataTypeModel.getSchema().$id }],
        },
        actorId: testUser.getEntityUuid(),
      })
        .then((val) => {
          favoriteBookPropertyTypeModel = val;
        })
        .catch((err) => {
          logger.error(`Something went wrong making Favorite Book: ${err}`);
          throw err;
        }),
      PropertyTypeModel.create(graphApi, {
        ownedById: testUser.getEntityUuid(),
        schema: {
          kind: "propertyType",
          title: "Name",
          oneOf: [{ $ref: textDataTypeModel.getSchema().$id }],
        },
        actorId: testUser.getEntityUuid(),
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
      ownedById: testUser.getEntityUuid(),
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
        actorId: testUser.getEntityUuid(),
      }),
      actorId: testUser.getEntityUuid(),
    });
  });

  let createdEntityModel: EntityModel;
  it("can create an entity", async () => {
    createdEntityModel = await EntityModel.create(graphApi, {
      ownedById: testUser.getEntityUuid(),
      properties: {
        [namePropertyTypeModel.getBaseUri()]: "Bob",
        [favoriteBookPropertyTypeModel.getBaseUri()]: "some text",
      },
      entityTypeModel,
      actorId: testUser.getEntityUuid(),
    });
  });

  it("can read an entity", async () => {
    const fetchedEntityModel = await EntityModel.getLatest(graphApi, {
      entityId: createdEntityModel.getBaseId(),
    });

    expect(fetchedEntityModel.getBaseId()).toEqual(
      createdEntityModel.getBaseId(),
    );
    expect(fetchedEntityModel.getVersion()).toEqual(
      createdEntityModel.getVersion(),
    );
  });

  let updatedEntityModel: EntityModel;
  it("can update an entity", async () => {
    expect(createdEntityModel.getMetadata().provenance.updatedById).toBe(
      testUser.getEntityUuid(),
    );

    updatedEntityModel = await createdEntityModel
      .update(graphApi, {
        properties: {
          [namePropertyTypeModel.getBaseUri()]: "Updated Bob",
          [favoriteBookPropertyTypeModel.getBaseUri()]:
            "Even more text than before",
        },
        actorId: testUser2.getEntityUuid(),
      })
      .catch((err) => Promise.reject(err.data));

    expect(updatedEntityModel.getMetadata().provenance.updatedById).toBe(
      testUser2.getEntityUuid(),
    );
  });

  it("can read all latest entities", async () => {
    const allEntityModels = (
      await EntityModel.getByQuery(graphApi, {
        all: [{ equal: [{ path: ["version"] }, { parameter: "latest" }] }],
      })
    ).filter((entity) => entity.getOwnedById() === testUser.getEntityUuid());

    const newlyUpdatedModel = allEntityModels.find(
      (ent) => ent.getBaseId() === updatedEntityModel.getBaseId(),
    );

    // Even though we've inserted two entities, they're the different versions
    // of the same entity. This should only retrieve a single entity.
    // Other tests pollute the database, though, so we can't rely on this test's
    // results in isolation.
    expect(allEntityModels.length).toBeGreaterThanOrEqual(1);
    expect(newlyUpdatedModel).toBeDefined();

    expect(newlyUpdatedModel!.getVersion()).toEqual(
      updatedEntityModel.getVersion(),
    );
    expect(
      (newlyUpdatedModel!.getProperties() as any)[
        namePropertyTypeModel.getBaseUri()
      ],
    ).toEqual(
      (updatedEntityModel.getProperties() as any)[
        namePropertyTypeModel.getBaseUri()
      ],
    );
  });

  it("can create entity with linked entities from an entity definition", async () => {
    const aliceEntityModel = await EntityModel.createEntityWithLinks(graphApi, {
      ownedById: testUser.getEntityUuid(),
      // First create a new entity given the following definition
      entityTypeId: entityTypeModel.getSchema().$id,
      properties: {
        [namePropertyTypeModel.getBaseUri()]: "Alice",
        [favoriteBookPropertyTypeModel.getBaseUri()]: "some text",
      },
      linkedEntities: [
        {
          // Then create an entity + link
          destinationAccountId: testUser.getBaseId(),
          linkEntityTypeId: linkEntityTypeFriendModel.getSchema().$id,
          entity: {
            // The "new" entity is in fact just an existing entity, so only a link will be created.
            existingEntityId: updatedEntityModel.getBaseId(),
          },
        },
      ],
      actorId: testUser.getEntityUuid(),
    });

    const linkEntityModel = (
      await aliceEntityModel.getOutgoingLinks(graphApi)
    ).map((outgoingLinkEntityModel) => outgoingLinkEntityModel)[0]!;

    expect(linkEntityModel.rightEntityModel.entity).toEqual(
      updatedEntityModel.entity,
    );
    expect(linkEntityModel.getMetadata().entityTypeId).toEqual(
      linkEntityTypeFriendModel.entityType.schema.$id,
    );
  });
});
