import { TypeSystemInitializer } from "@blockprotocol/type-system";
import {
  ensureSystemGraphIsInitialized,
  ImpureGraphContext,
  zeroedGraphResolveDepths,
} from "@hashintel/hash-api/src/graph";
import {
  createEntity,
  createEntityWithLinks,
  getEntityOutgoingLinks,
  getLatestEntityById,
  updateEntity,
} from "@hashintel/hash-api/src/graph/knowledge/primitive/entity";
import { getLinkEntityRightEntity } from "@hashintel/hash-api/src/graph/knowledge/primitive/link-entity";
import { User } from "@hashintel/hash-api/src/graph/knowledge/system-types/user";
import { createDataType } from "@hashintel/hash-api/src/graph/ontology/primitive/data-type";
import { createEntityType } from "@hashintel/hash-api/src/graph/ontology/primitive/entity-type";
import { createPropertyType } from "@hashintel/hash-api/src/graph/ontology/primitive/property-type";
import { generateSystemEntityTypeSchema } from "@hashintel/hash-api/src/graph/util";
import {
  DataTypeWithMetadata,
  Entity,
  EntityTypeWithMetadata,
  extractOwnedByIdFromEntityId,
  linkEntityTypeUri,
  PropertyTypeWithMetadata,
  Subgraph,
  SubgraphRootTypes,
} from "@hashintel/hash-subgraph";
import { getRootsAsEntities } from "@hashintel/hash-subgraph/src/stdlib/element/entity";
import { Logger } from "@local/hash-backend-utils/logger";
import { generateTypeId } from "@local/hash-isomorphic-utils/ontology-types";
import { EntityId, OwnedById } from "@local/hash-isomorphic-utils/types";

import { createTestImpureGraphContext, createTestUser } from "../../../util";

jest.setTimeout(60000);

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

const graphContext: ImpureGraphContext = createTestImpureGraphContext();
const { graphApi } = graphContext;

describe("Entity CRU", () => {
  let testUser: User;
  let testUser2: User;
  let entityType: EntityTypeWithMetadata;
  let textDataType: DataTypeWithMetadata;
  let namePropertyType: PropertyTypeWithMetadata;
  let favoriteBookPropertyType: PropertyTypeWithMetadata;
  let linkEntityTypeFriend: EntityTypeWithMetadata;

  beforeAll(async () => {
    await TypeSystemInitializer.initialize();
    await ensureSystemGraphIsInitialized({ logger, context: graphContext });

    testUser = await createTestUser(graphContext, "entitytest", logger);
    testUser2 = await createTestUser(graphContext, "entitytest", logger);

    textDataType = await createDataType(graphContext, {
      ownedById: testUser.accountId as OwnedById,
      schema: {
        kind: "dataType",
        title: "Text",
        type: "string",
      },
      actorId: testUser.accountId,
    }).catch((err) => {
      logger.error("Something went wrong making Text", err);
      throw err;
    });

    await Promise.all([
      createEntityType(graphContext, {
        ownedById: testUser.accountId as OwnedById,
        schema: {
          kind: "entityType",
          title: "Friends",
          description: "Friend of",
          type: "object",
          properties: {},
          allOf: [{ $ref: linkEntityTypeUri }],
        },
        actorId: testUser.accountId,
      })
        .then((val) => {
          linkEntityTypeFriend = val;
        })
        .catch((err) => {
          logger.error("Something went wrong making link type Friends", err);
          throw err;
        }),
      createPropertyType(graphContext, {
        ownedById: testUser.accountId as OwnedById,
        schema: {
          kind: "propertyType",
          title: "Favorite Book",
          oneOf: [{ $ref: textDataType.schema.$id }],
        },
        actorId: testUser.accountId,
      })
        .then((val) => {
          favoriteBookPropertyType = val;
        })
        .catch((err) => {
          logger.error("Something went wrong making Favorite Book", err);
          throw err;
        }),
      createPropertyType(graphContext, {
        ownedById: testUser.accountId as OwnedById,
        schema: {
          kind: "propertyType",
          title: "Name",
          oneOf: [{ $ref: textDataType.schema.$id }],
        },
        actorId: testUser.accountId,
      })
        .then((val) => {
          namePropertyType = val;
        })
        .catch((err) => {
          logger.error("Something went wrong making Names", err);
          throw err;
        }),
    ]);

    entityType = await createEntityType(graphContext, {
      ownedById: testUser.accountId as OwnedById,
      schema: generateSystemEntityTypeSchema({
        entityTypeId: generateTypeId({
          namespace: testUser.shortname!,
          kind: "entity-type",
          title: "Person",
        }),
        title: "Person",
        properties: [
          { propertyType: favoriteBookPropertyType },
          { propertyType: namePropertyType },
        ],
        outgoingLinks: [
          {
            linkEntityType: linkEntityTypeFriend,
            destinationEntityTypes: ["SELF_REFERENCE"],
          },
        ],
      }),
      actorId: testUser.accountId,
    });
  });

  let createdEntity: Entity;
  it("can create an entity", async () => {
    createdEntity = await createEntity(graphContext, {
      ownedById: testUser.accountId as OwnedById,
      properties: {
        [namePropertyType.metadata.editionId.baseId]: "Bob",
        [favoriteBookPropertyType.metadata.editionId.baseId]: "some text",
      },
      entityTypeId: entityType.schema.$id,
      actorId: testUser.accountId,
    });
  });

  it("can read an entity", async () => {
    const fetchedEntity = await getLatestEntityById(graphContext, {
      entityId: createdEntity.metadata.editionId.baseId,
    });

    expect(fetchedEntity.metadata.editionId.baseId).toEqual(
      createdEntity.metadata.editionId.baseId,
    );
    expect(fetchedEntity.metadata.editionId.recordId).toEqual(
      createdEntity.metadata.editionId.recordId,
    );
  });

  let updatedEntity: Entity;
  it("can update an entity", async () => {
    expect(createdEntity.metadata.provenance.updatedById).toBe(
      testUser.accountId,
    );

    updatedEntity = await updateEntity(graphContext, {
      entity: createdEntity,
      properties: {
        [namePropertyType.metadata.editionId.baseId]: "Updated Bob",
        [favoriteBookPropertyType.metadata.editionId.baseId]:
          "Even more text than before",
      },
      actorId: testUser2.accountId,
    }).catch((err) => Promise.reject(err.data));

    expect(updatedEntity.metadata.provenance.updatedById).toBe(
      testUser2.accountId,
    );
  });

  it("can read all latest entities", async () => {
    const allEntitys = await graphApi
      .getEntitiesByQuery({
        filter: {
          all: [],
        },
        graphResolveDepths: zeroedGraphResolveDepths,
        timeProjection: {
          kernel: {
            axis: "transaction",
            timestamp: undefined,
          },
          image: {
            axis: "decision",
            start: undefined,
            end: undefined,
          },
        },
      })
      .then(({ data }) =>
        getRootsAsEntities(
          data as Subgraph<SubgraphRootTypes["entity"]>,
        ).filter(
          (entity) =>
            extractOwnedByIdFromEntityId(entity.metadata.editionId.baseId) ===
            testUser.accountId,
        ),
      );

    const newlyUpdated = allEntitys.find(
      (ent) =>
        ent.metadata.editionId.baseId ===
        updatedEntity.metadata.editionId.baseId,
    );

    // Even though we've inserted two entities, they're the different versions
    // of the same entity. This should only retrieve a single entity.
    // Other tests pollute the database, though, so we can't rely on this test's
    // results in isolation.
    expect(allEntitys.length).toBeGreaterThanOrEqual(1);
    expect(newlyUpdated).toBeDefined();

    expect(newlyUpdated?.metadata.editionId.recordId).toEqual(
      updatedEntity.metadata.editionId.recordId,
    );
    expect(
      newlyUpdated?.properties[namePropertyType.metadata.editionId.baseId],
    ).toEqual(
      updatedEntity.properties[namePropertyType.metadata.editionId.baseId],
    );
  });

  it("can create entity with linked entities from an entity definition", async () => {
    const aliceEntity = await createEntityWithLinks(graphContext, {
      ownedById: testUser.accountId as OwnedById,
      // First create a new entity given the following definition
      entityTypeId: entityType.schema.$id,
      properties: {
        [namePropertyType.metadata.editionId.baseId]: "Alice",
        [favoriteBookPropertyType.metadata.editionId.baseId]: "some text",
      },
      linkedEntities: [
        {
          // Then create an entity + link
          destinationAccountId: testUser.accountId,
          linkEntityTypeId: linkEntityTypeFriend.schema.$id,
          entity: {
            // The "new" entity is in fact just an existing entity, so only a link will be created.
            existingEntityId: updatedEntity.metadata.editionId
              .baseId as EntityId,
          },
        },
      ],
      actorId: testUser.accountId,
    });

    const linkEntity = (
      await getEntityOutgoingLinks(graphContext, {
        entity: aliceEntity,
      })
    )[0]!;

    expect(
      await getLinkEntityRightEntity(graphContext, { linkEntity }),
    ).toEqual(updatedEntity);
    expect(linkEntity.metadata.entityTypeId).toEqual(
      linkEntityTypeFriend.schema.$id,
    );
  });
});
