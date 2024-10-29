import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import { generateSystemEntityTypeSchema } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized/migrate-ontology-types/util";
import {
  createEntity,
  createEntityWithLinks,
  getEntityOutgoingLinks,
  getLatestEntityById,
  updateEntity,
} from "@apps/hash-api/src/graph/knowledge/primitive/entity";
import { getLinkEntityRightEntity } from "@apps/hash-api/src/graph/knowledge/primitive/link-entity";
import type { Org } from "@apps/hash-api/src/graph/knowledge/system-types/org";
import type { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { joinOrg } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { createEntityType } from "@apps/hash-api/src/graph/ontology/primitive/entity-type";
import { createPropertyType } from "@apps/hash-api/src/graph/ontology/primitive/property-type";
import { Logger } from "@local/hash-backend-utils/logger";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type {
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-graph-types/ontology";
import type { OwnedById } from "@local/hash-graph-types/web";
import {
  createDefaultAuthorizationRelationships,
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { generateTypeId } from "@local/hash-isomorphic-utils/ontology-types";
import { mapGraphApiSubgraphToSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { EntityRootType } from "@local/hash-subgraph";
import { linkEntityTypeUrl } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { beforeAll, describe, expect, it } from "vitest";

import { resetGraph } from "../../../test-server";
import {
  createTestImpureGraphContext,
  createTestOrg,
  createTestUser,
  textDataTypeId,
} from "../../../util";

const logger = new Logger({
  environment: "test",
  level: "debug",
  serviceName: "integration-tests",
});

const graphContext = createTestImpureGraphContext();
const { graphApi } = graphContext;

describe("Entity CRU", () => {
  let testOrg: Org;
  let testUser: User;
  let testUser2: User;
  let entityType: EntityTypeWithMetadata;
  let namePropertyType: PropertyTypeWithMetadata;
  let favoriteBookPropertyType: PropertyTypeWithMetadata;
  let linkEntityTypeFriend: EntityTypeWithMetadata;

  beforeAll(async () => {
    await ensureSystemGraphIsInitialized({ logger, context: graphContext });

    testUser = await createTestUser(graphContext, "entitytest", logger);
    testUser2 = await createTestUser(graphContext, "entitytest", logger);

    const authentication = { actorId: testUser.accountId };

    testOrg = await createTestOrg(
      graphContext,
      authentication,
      "entitytestorg",
    );
    await joinOrg(graphContext, authentication, {
      userEntityId: testUser2.entity.metadata.recordId.entityId,
      orgEntityId: testOrg.entity.metadata.recordId.entityId,
    });

    await Promise.all([
      createEntityType(graphContext, authentication, {
        ownedById: testUser.accountId as OwnedById,
        schema: {
          title: "Friends",
          description: "Friend of",
          type: "object",
          properties: {},
          allOf: [{ $ref: linkEntityTypeUrl }],
        },
        relationships: [
          {
            relation: "viewer",
            subject: {
              kind: "public",
            },
          },
          {
            relation: "instantiator",
            subject: {
              kind: "public",
            },
          },
        ],
      })
        .then((val) => {
          linkEntityTypeFriend = val;
        })
        .catch((err) => {
          logger.error("Something went wrong making link type Friends", err);
          throw err;
        }),
      createPropertyType(graphContext, authentication, {
        ownedById: testUser.accountId as OwnedById,
        schema: {
          title: "Favorite Book",
          description: "The favorite book of a person",
          oneOf: [{ $ref: textDataTypeId }],
        },
        relationships: [
          {
            relation: "viewer",
            subject: {
              kind: "public",
            },
          },
        ],
      })
        .then((val) => {
          favoriteBookPropertyType = val;
        })
        .catch((err) => {
          logger.error("Something went wrong making Favorite Book", err);
          throw err;
        }),
      createPropertyType(graphContext, authentication, {
        ownedById: testUser.accountId as OwnedById,
        schema: {
          title: "Name",
          description: "The name of a person",
          oneOf: [{ $ref: textDataTypeId }],
        },
        relationships: [
          {
            relation: "viewer",
            subject: {
              kind: "public",
            },
          },
        ],
      })
        .then((val) => {
          namePropertyType = val;
        })
        .catch((err) => {
          logger.error("Something went wrong making Names", err);
          throw err;
        }),
    ]);

    entityType = await createEntityType(graphContext, authentication, {
      ownedById: testOrg.accountGroupId as OwnedById,
      schema: generateSystemEntityTypeSchema({
        entityTypeId: generateTypeId({
          webShortname: testOrg.shortname,
          kind: "entity-type",
          title: "Person",
        }),
        title: "Person",
        description: "A person",
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
      relationships: [
        {
          relation: "viewer",
          subject: {
            kind: "public",
          },
        },
        {
          relation: "instantiator",
          subject: {
            kind: "public",
          },
        },
      ],
    });

    return async () => {
      await deleteKratosIdentity({
        kratosIdentityId: testUser.kratosIdentityId,
      });
      await deleteKratosIdentity({
        kratosIdentityId: testUser2.kratosIdentityId,
      });

      await resetGraph();
    };
  });

  let createdEntity: Entity;
  it("can create an entity", async () => {
    const authentication = { actorId: testUser.accountId };
    createdEntity = await createEntity(graphContext, authentication, {
      ownedById: testOrg.accountGroupId as OwnedById,
      properties: {
        value: {
          [namePropertyType.metadata.recordId.baseUrl]: {
            value: "Bob",
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
          [favoriteBookPropertyType.metadata.recordId.baseUrl]: {
            value: "some text",
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
        },
      },
      entityTypeId: entityType.schema.$id,
      relationships: createDefaultAuthorizationRelationships(authentication),
    });
  });

  it("can read an entity", async () => {
    const fetchedEntity = await getLatestEntityById(
      graphContext,
      { actorId: testUser.accountId },
      {
        entityId: createdEntity.metadata.recordId.entityId,
      },
    );

    expect(fetchedEntity.metadata.recordId.entityId).toEqual(
      createdEntity.metadata.recordId.entityId,
    );
    expect(fetchedEntity.metadata.recordId.editionId).toEqual(
      createdEntity.metadata.recordId.editionId,
    );
  });

  let updatedEntity: Entity;
  it("can update an entity", async () => {
    expect(createdEntity.metadata.provenance.edition.createdById).toBe(
      testUser.accountId,
    );

    updatedEntity = await updateEntity(
      graphContext,
      { actorId: testUser2.accountId },
      {
        entity: createdEntity,
        propertyPatches: [
          {
            op: "replace",
            path: [namePropertyType.metadata.recordId.baseUrl],
            property: {
              value: "Updated Bob",
              metadata: {
                dataTypeId:
                  "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
              },
            },
          },
          {
            op: "replace",
            path: [favoriteBookPropertyType.metadata.recordId.baseUrl],
            property: {
              value: "Even more text than before",
              metadata: {
                dataTypeId:
                  "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
              },
            },
          },
        ],
      },
    ).catch((err) => Promise.reject(err));

    expect(updatedEntity.metadata.provenance.edition.createdById).toBe(
      testUser2.accountId,
    );
  });

  it("can read all latest person entities", async () => {
    const allEntities = await graphApi
      .getEntitySubgraph(testUser.accountId, {
        filter: {
          all: [
            {
              equal: [
                { path: ["ownedById"] },
                { parameter: testOrg.accountGroupId },
              ],
            },
            {
              endsWith: [
                { path: ["type(inheritanceDepth=0)", "baseUrl"] },
                {
                  parameter: `/types/entity-type/person/`,
                },
              ],
            },
          ],
        },
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
      })
      .then(({ data }) =>
        getRoots(
          mapGraphApiSubgraphToSubgraph<EntityRootType>(
            data.subgraph,
            testUser.accountId,
          ),
        ),
      );

    const newlyUpdated = allEntities.find(
      (ent) =>
        ent.metadata.recordId.entityId ===
        updatedEntity.metadata.recordId.entityId,
    );

    // Even though we've inserted two entities, they're the different versions of the same entity.
    expect(allEntities.length).toBe(1);
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
    const aliceEntity = await createEntityWithLinks(
      graphContext,
      { actorId: testUser.accountId },
      {
        ownedById: testUser.accountId as OwnedById,
        // First create a new entity given the following definition
        entityTypeId: entityType.schema.$id,
        properties: {
          value: {
            [namePropertyType.metadata.recordId.baseUrl]: {
              value: "Alice",
              metadata: {
                dataTypeId:
                  "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
              },
            },
            [favoriteBookPropertyType.metadata.recordId.baseUrl]: {
              value: "some text",
              metadata: {
                dataTypeId:
                  "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
              },
            },
          },
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
        relationships: createDefaultAuthorizationRelationships({
          actorId: testUser.accountId,
        }),
      },
    );

    const linkEntity = (
      await getEntityOutgoingLinks(
        graphContext,
        { actorId: testUser.accountId },
        {
          entityId: aliceEntity.metadata.recordId.entityId,
        },
      )
    )[0]!;

    expect(
      await getLinkEntityRightEntity(
        graphContext,
        { actorId: testUser.accountId },
        { linkEntity },
      ),
    ).toEqual(updatedEntity);
    expect(linkEntity.metadata.entityTypeId).toEqual(
      linkEntityTypeFriend.schema.$id,
    );
  });
});
