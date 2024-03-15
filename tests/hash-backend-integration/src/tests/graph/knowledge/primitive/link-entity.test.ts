import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import type { EntityTypeDefinition } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized/migrate-ontology-types/util";
import { generateSystemEntityTypeSchema } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized/migrate-ontology-types/util";
import {
  archiveEntity,
  createEntity,
  getEntityOutgoingLinks,
} from "@apps/hash-api/src/graph/knowledge/primitive/entity";
import {
  createLinkEntity,
  getLinkEntityLeftEntity,
  getLinkEntityRightEntity,
} from "@apps/hash-api/src/graph/knowledge/primitive/link-entity";
import type { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { createEntityType } from "@apps/hash-api/src/graph/ontology/primitive/entity-type";
import { TypeSystemInitializer } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";
import { createDefaultAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import { generateTypeId } from "@local/hash-isomorphic-utils/ontology-types";
import type {
  Entity,
  EntityTypeWithMetadata,
  OwnedById,
} from "@local/hash-subgraph";
import { linkEntityTypeUrl } from "@local/hash-subgraph";
import type { LinkEntity } from "@local/hash-subgraph/type-system-patch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resetGraph } from "../../../test-server";
import { createTestImpureGraphContext, createTestUser } from "../../../util";

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

const graphContext = createTestImpureGraphContext();

describe("Link entity", () => {
  let webShortname: string;

  let testUser: User;
  let testEntityType: EntityTypeWithMetadata;
  let friendLinkEntityType: EntityTypeWithMetadata;
  let acquaintanceLinkEntityType: EntityTypeWithMetadata;
  let leftEntity: Entity;
  let friendRightEntity: Entity;
  let acquaintanceRightEntity: Entity;

  const createTestEntityType = (
    params: Omit<
      EntityTypeDefinition,
      "entityTypeId" | "actorId" | "webShortname"
    >,
  ) => {
    const entityTypeId = generateTypeId({
      webShortname,
      kind: "entity-type",
      title: params.title,
    });
    return createEntityType(
      graphContext,
      { actorId: testUser.accountId },
      {
        ownedById: testUser.accountId as OwnedById,
        schema: generateSystemEntityTypeSchema({
          entityTypeId,
          ...params,
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
      },
    );
  };

  beforeAll(async () => {
    await TypeSystemInitializer.initialize();
    await ensureSystemGraphIsInitialized({ logger, context: graphContext });

    testUser = await createTestUser(graphContext, "linktest", logger);
    const authentication = { actorId: testUser.accountId };

    webShortname = testUser.shortname!;

    await Promise.all([
      createEntityType(graphContext, authentication, {
        ownedById: testUser.accountId as OwnedById,
        schema: {
          title: "Friends",
          description: "Friend of",
          type: "object",
          allOf: [{ $ref: linkEntityTypeUrl }],
          properties: {},
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
      }).then((linkEntityType) => {
        friendLinkEntityType = linkEntityType;
      }),
      createEntityType(graphContext, authentication, {
        ownedById: testUser.accountId as OwnedById,
        schema: {
          title: "Acquaintance",
          description: "Acquainted with",
          type: "object",
          allOf: [{ $ref: linkEntityTypeUrl }],
          properties: {},
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
      }).then((linkEntityType) => {
        acquaintanceLinkEntityType = linkEntityType;
      }),
    ]);

    testEntityType = await createTestEntityType({
      title: "Person",
      properties: [],
      outgoingLinks: [
        {
          linkEntityType: friendLinkEntityType,
          destinationEntityTypes: ["SELF_REFERENCE"],
          ordered: false,
        },
        {
          linkEntityType: acquaintanceLinkEntityType,
          destinationEntityTypes: ["SELF_REFERENCE"],
          ordered: false,
        },
      ],
    });

    await Promise.all([
      createEntity(graphContext, authentication, {
        ownedById: testUser.accountId as OwnedById,
        entityTypeId: testEntityType.schema.$id,
        properties: {},
        relationships: createDefaultAuthorizationRelationships(authentication),
      }).then((entity) => {
        leftEntity = entity;
      }),
      createEntity(graphContext, authentication, {
        ownedById: testUser.accountId as OwnedById,
        entityTypeId: testEntityType.schema.$id,
        properties: {},
        relationships: createDefaultAuthorizationRelationships(authentication),
      }).then((entity) => {
        friendRightEntity = entity;
      }),
      createEntity(graphContext, authentication, {
        ownedById: testUser.accountId as OwnedById,
        entityTypeId: testEntityType.schema.$id,
        properties: {},
        relationships: createDefaultAuthorizationRelationships(authentication),
      }).then((entity) => {
        acquaintanceRightEntity = entity;
      }),
    ]);

    return async () => {
      await deleteKratosIdentity({
        kratosIdentityId: testUser.kratosIdentityId,
      });

      await resetGraph();
    };
  });

  let linkEntityFriend: LinkEntity;
  let linkEntityAcquaintance: LinkEntity;

  it("can link entities", async () => {
    const authentication = { actorId: testUser.accountId };

    linkEntityFriend = await createLinkEntity(graphContext, authentication, {
      ownedById: testUser.accountId as OwnedById,
      leftEntityId: leftEntity.metadata.recordId.entityId,
      linkEntityTypeId: friendLinkEntityType.schema.$id,
      rightEntityId: friendRightEntity.metadata.recordId.entityId,
      relationships: createDefaultAuthorizationRelationships(authentication),
    });

    linkEntityAcquaintance = await createLinkEntity(
      graphContext,
      authentication,
      {
        ownedById: testUser.accountId as OwnedById,
        leftEntityId: leftEntity.metadata.recordId.entityId,
        linkEntityTypeId: acquaintanceLinkEntityType.schema.$id,
        rightEntityId: acquaintanceRightEntity.metadata.recordId.entityId,
        relationships: createDefaultAuthorizationRelationships(authentication),
      },
    );
  });

  it("can get all entity links", async () => {
    const authentication = { actorId: testUser.accountId };

    const allLinks = await getEntityOutgoingLinks(
      graphContext,
      authentication,
      {
        entityId: leftEntity.metadata.recordId.entityId,
      },
    );
    expect(allLinks).toHaveLength(2);
    expect(allLinks).toContainEqual(linkEntityFriend);
    expect(allLinks).toContainEqual(linkEntityAcquaintance);
  });

  it("can get a single entity link", async () => {
    const authentication = { actorId: testUser.accountId };

    const links = await getEntityOutgoingLinks(graphContext, authentication, {
      entityId: leftEntity.metadata.recordId.entityId,
      linkEntityTypeVersionedUrl: friendLinkEntityType.schema.$id,
    });

    expect(links).toHaveLength(1);
    const linkEntity = links[0]!;

    expect(
      await getLinkEntityLeftEntity(graphContext, authentication, {
        linkEntity,
      }),
    ).toEqual(leftEntity);
    expect(linkEntity.metadata.entityTypeId).toEqual(
      friendLinkEntityType.schema.$id,
    );
    expect(
      await getLinkEntityRightEntity(graphContext, authentication, {
        linkEntity,
      }),
    ).toEqual(friendRightEntity);
  });

  it("can archive a link", async () => {
    const authentication = { actorId: testUser.accountId };

    await archiveEntity(graphContext, authentication, {
      entity: linkEntityAcquaintance,
    });

    const links = await getEntityOutgoingLinks(graphContext, authentication, {
      entityId: leftEntity.metadata.recordId.entityId,
      linkEntityTypeVersionedUrl: acquaintanceLinkEntityType.schema.$id,
    });

    expect(links).toHaveLength(0);
  });
});
