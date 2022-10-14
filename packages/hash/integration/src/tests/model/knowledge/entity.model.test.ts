import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import {
  EntityModel,
  EntityTypeModel,
  DataTypeModel,
  PropertyTypeModel,
  LinkTypeModel,
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
  let ownedById: string;
  let entityTypeModel: EntityTypeModel;
  let textDataTypeModel: DataTypeModel;
  let namePropertyTypeModel: PropertyTypeModel;
  let favoriteBookPropertyTypeModel: PropertyTypeModel;
  let linkTypeFriend: LinkTypeModel;

  beforeAll(async () => {
    const testUser = await createTestUser(graphApi, "entitytest", logger);

    ownedById = testUser.entityId;

    textDataTypeModel = await DataTypeModel.create(graphApi, {
      ownedById,
      schema: {
        kind: "dataType",
        title: "Text",
        type: "string",
      },
    }).catch((err) => {
      logger.error(`Something went wrong making Text: ${err}`);
      throw err;
    });

    await Promise.all([
      LinkTypeModel.create(graphApi, {
        ownedById,
        schema: {
          kind: "linkType",
          title: "Friends",
          pluralTitle: "Friends",
          description: "Friend of",
        },
      })
        .then((val) => {
          linkTypeFriend = val;
        })
        .catch((err) => {
          logger.error(`Something went wrong making link type Friends: ${err}`);
          throw err;
        }),

      PropertyTypeModel.create(graphApi, {
        ownedById,
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
        ownedById,
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

    entityTypeModel = await EntityTypeModel.create(graphApi, {
      ownedById,
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
      }),
    });
  });

  let createdEntityModel: EntityModel;
  it("can create an entity", async () => {
    createdEntityModel = await EntityModel.create(graphApi, {
      ownedById,
      properties: {
        [namePropertyTypeModel.baseUri]: "Bob",
        [favoriteBookPropertyTypeModel.baseUri]: "some text",
      },
      entityTypeModel,
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
    updatedEntityModel = await createdEntityModel
      .update(graphApi, {
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
    ).filter((entity) => entity.ownedById === ownedById);

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
      ownedById,
      // First create a new entity given the following definition
      entityTypeId: entityTypeModel.schema.$id,
      properties: {
        [namePropertyTypeModel.baseUri]: "Alice",
        [favoriteBookPropertyTypeModel.baseUri]: "some text",
      },
      linkedEntities: [
        {
          // Then create an entity + link
          destinationAccountId: ownedById,
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
    });

    const linkedEntity = (
      await aliceEntityModel.getOutgoingLinks(graphApi)
    ).map((linkModel) => linkModel)[0]!;

    expect(linkedEntity.targetEntityModel).toEqual(updatedEntityModel);
    expect(linkedEntity.linkTypeModel).toEqual(linkTypeFriend);
  });
});
