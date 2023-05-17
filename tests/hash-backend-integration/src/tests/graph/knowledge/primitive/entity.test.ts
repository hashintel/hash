import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import {
  currentTimeInstantTemporalAxes,
  ensureSystemGraphIsInitialized,
  ImpureGraphContext,
  zeroedGraphResolveDepths,
} from "@apps/hash-api/src/graph";
import {
  createEntity,
  createEntityWithLinks,
  getEntityOutgoingLinks,
  getLatestEntityById,
  updateEntity,
} from "@apps/hash-api/src/graph/knowledge/primitive/entity";
import { getLinkEntityRightEntity } from "@apps/hash-api/src/graph/knowledge/primitive/link-entity";
import { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { createDataType } from "@apps/hash-api/src/graph/ontology/primitive/data-type";
import { createEntityType } from "@apps/hash-api/src/graph/ontology/primitive/entity-type";
import { createPropertyType } from "@apps/hash-api/src/graph/ontology/primitive/property-type";
import { systemUser } from "@apps/hash-api/src/graph/system-user";
import { generateSystemEntityTypeSchema } from "@apps/hash-api/src/graph/util";
import { TypeSystemInitializer } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";
import { generateTypeId } from "@local/hash-isomorphic-utils/ontology-types";
import {
  DataTypeWithMetadata,
  Entity,
  EntityRootType,
  EntityTypeWithMetadata,
  extractOwnedByIdFromEntityId,
  linkEntityTypeUrl,
  OwnedById,
  PropertyTypeWithMetadata,
  Subgraph,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";

import { resetGraph } from "../../../test-server";
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
          title: "Friends",
          description: "Friend of",
          type: "object",
          properties: {},
          allOf: [{ $ref: linkEntityTypeUrl }],
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

  afterAll(async () => {
    await deleteKratosIdentity({
      kratosIdentityId: testUser.kratosIdentityId,
    });
    await deleteKratosIdentity({
      kratosIdentityId: testUser2.kratosIdentityId,
    });
    await deleteKratosIdentity({
      kratosIdentityId: systemUser.kratosIdentityId,
    });

    await resetGraph();
  });

  let createdEntity: Entity;
  it("can create an entity", async () => {
    createdEntity = await createEntity(graphContext, {
      ownedById: testUser.accountId as OwnedById,
      properties: {
        [namePropertyType.metadata.recordId.baseUrl]: "Bob",
        [favoriteBookPropertyType.metadata.recordId.baseUrl]: "some text",
      },
      entityTypeId: entityType.schema.$id,
      actorId: testUser.accountId,
    });
  });

  it("can read an entity", async () => {
    const fetchedEntity = await getLatestEntityById(graphContext, {
      entityId: createdEntity.metadata.recordId.entityId,
    });

    expect(fetchedEntity.metadata.recordId.entityId).toEqual(
      createdEntity.metadata.recordId.entityId,
    );
    expect(fetchedEntity.metadata.recordId.editionId).toEqual(
      createdEntity.metadata.recordId.editionId,
    );
  });

  let updatedEntity: Entity;
  it("can update an entity", async () => {
    expect(createdEntity.metadata.provenance.recordCreatedById).toBe(
      testUser.accountId,
    );

    updatedEntity = await updateEntity(graphContext, {
      entity: createdEntity,
      properties: {
        [namePropertyType.metadata.recordId.baseUrl]: "Updated Bob",
        [favoriteBookPropertyType.metadata.recordId.baseUrl]:
          "Even more text than before",
      },
      actorId: testUser2.accountId,
    }).catch((err) => Promise.reject(err.data));

    expect(updatedEntity.metadata.provenance.recordCreatedById).toBe(
      testUser2.accountId,
    );
  });

  it("can read all latest entities", async () => {
    const allEntities = await graphApi
      .getEntitiesByQuery({
        filter: {
          all: [],
        },
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: currentTimeInstantTemporalAxes,
      })
      .then(({ data }) =>
        getRoots(data as Subgraph<EntityRootType>).filter(
          (entity) =>
            extractOwnedByIdFromEntityId(entity.metadata.recordId.entityId) ===
            testUser.accountId,
        ),
      );

    const newlyUpdated = allEntities.find(
      (ent) =>
        ent.metadata.recordId.entityId ===
        updatedEntity.metadata.recordId.entityId,
    );

    // Even though we've inserted two entities, they're the different versions
    // of the same entity. This should only retrieve a single entity.
    // Other tests pollute the database, though, so we can't rely on this test's
    // results in isolation.
    expect(allEntities.length).toBeGreaterThanOrEqual(1);
    expect(newlyUpdated).toBeDefined();

    expect(newlyUpdated?.metadata.recordId.editionId).toEqual(
      updatedEntity.metadata.recordId.editionId,
    );
    expect(
      newlyUpdated?.properties[namePropertyType.metadata.recordId.baseUrl],
    ).toEqual(
      updatedEntity.properties[namePropertyType.metadata.recordId.baseUrl],
    );
  });

  it("can create entity with linked entities from an entity definition", async () => {
    const aliceEntity = await createEntityWithLinks(graphContext, {
      ownedById: testUser.accountId as OwnedById,
      // First create a new entity given the following definition
      entityTypeId: entityType.schema.$id,
      properties: {
        [namePropertyType.metadata.recordId.baseUrl]: "Alice",
        [favoriteBookPropertyType.metadata.recordId.baseUrl]: "some text",
      },
      linkedEntities: [
        {
          // Then create an entity + link
          destinationAccountId: testUser.accountId,
          linkEntityTypeId: linkEntityTypeFriend.schema.$id,
          entity: {
            // The "new" entity is in fact just an existing entity, so only a link will be created.
            existingEntityId: updatedEntity.metadata.recordId.entityId,
          },
        },
      ],
      actorId: testUser.accountId,
    });

    const linkEntity = (
      await getEntityOutgoingLinks(graphContext, {
        entityId: aliceEntity.metadata.recordId.entityId,
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
