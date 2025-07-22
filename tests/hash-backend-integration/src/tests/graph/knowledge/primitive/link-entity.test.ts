import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import type { EntityTypeDefinition } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized/migrate-ontology-types/util";
import { generateSystemEntityTypeSchema } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized/migrate-ontology-types/util";
import {
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
import type { EntityTypeWithMetadata, WebId } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";
import type { HashEntity, HashLinkEntity } from "@local/hash-graph-sdk/entity";
import { blockProtocolEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { generateTypeId } from "@local/hash-isomorphic-utils/ontology-types";
import { beforeAll, describe, expect, it } from "vitest";

import { resetGraph } from "../../../test-server";
import { createTestImpureGraphContext, createTestUser } from "../../../util";

const logger = new Logger({
  environment: "test",
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
  let leftEntity: HashEntity;
  let friendRightEntity: HashEntity;
  let acquaintanceRightEntity: HashEntity;

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
        webId: testUser.accountId as WebId,
        schema: generateSystemEntityTypeSchema({
          entityTypeId,
          ...params,
        }),
      },
    );
  };

  beforeAll(async () => {
    await ensureSystemGraphIsInitialized({
      logger,
      context: graphContext,
      seedSystemPolicies: true,
    });

    testUser = await createTestUser(graphContext, "linktest", logger);
    const authentication = { actorId: testUser.accountId };

    webShortname = testUser.shortname!;

    await Promise.all([
      createEntityType(graphContext, authentication, {
        webId: testUser.accountId as WebId,
        schema: {
          title: "Friends",
          description: "Friend of",
          type: "object",
          allOf: [{ $ref: blockProtocolEntityTypes.link.entityTypeId }],
          properties: {},
        },
      }).then((linkEntityType) => {
        friendLinkEntityType = linkEntityType;
      }),
      createEntityType(graphContext, authentication, {
        webId: testUser.accountId as WebId,
        schema: {
          title: "Acquaintance",
          description: "Acquainted with",
          type: "object",
          allOf: [{ $ref: blockProtocolEntityTypes.link.entityTypeId }],
          properties: {},
        },
      }).then((linkEntityType) => {
        acquaintanceLinkEntityType = linkEntityType;
      }),
    ]);

    testEntityType = await createTestEntityType({
      title: "Person",
      description: "A person",
      properties: [],
      outgoingLinks: [
        {
          linkEntityType: friendLinkEntityType,
          destinationEntityTypes: ["SELF_REFERENCE"],
        },
        {
          linkEntityType: acquaintanceLinkEntityType,
          destinationEntityTypes: ["SELF_REFERENCE"],
        },
      ],
    });

    await Promise.all([
      createEntity(graphContext, authentication, {
        webId: testUser.accountId as WebId,
        entityTypeIds: [testEntityType.schema.$id],
        properties: { value: {} },
      }).then((entity) => {
        leftEntity = entity;
      }),
      createEntity(graphContext, authentication, {
        webId: testUser.accountId as WebId,
        entityTypeIds: [testEntityType.schema.$id],
        properties: { value: {} },
      }).then((entity) => {
        friendRightEntity = entity;
      }),
      createEntity(graphContext, authentication, {
        webId: testUser.accountId as WebId,
        entityTypeIds: [testEntityType.schema.$id],
        properties: { value: {} },
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

  let linkEntityFriend: HashLinkEntity;
  let linkEntityAcquaintance: HashLinkEntity;

  it("can link entities", async () => {
    const authentication = { actorId: testUser.accountId };

    linkEntityFriend = await createLinkEntity(graphContext, authentication, {
      webId: testUser.accountId as WebId,
      properties: { value: {} },
      linkData: {
        leftEntityId: leftEntity.metadata.recordId.entityId,
        rightEntityId: friendRightEntity.metadata.recordId.entityId,
      },
      entityTypeIds: [friendLinkEntityType.schema.$id],
    });

    linkEntityAcquaintance = await createLinkEntity(
      graphContext,
      authentication,
      {
        webId: testUser.accountId as WebId,
        properties: { value: {} },
        linkData: {
          leftEntityId: leftEntity.metadata.recordId.entityId,
          rightEntityId: acquaintanceRightEntity.metadata.recordId.entityId,
        },
        entityTypeIds: [acquaintanceLinkEntityType.schema.$id],
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
    expect(linkEntity.metadata.entityTypeIds).toContain(
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

    await linkEntityAcquaintance.archive(
      graphContext.graphApi,
      authentication,
      {
        actorType: "machine",
        origin: {
          type: "api",
          environment: "test",
        },
      },
    );

    const links = await getEntityOutgoingLinks(graphContext, authentication, {
      entityId: leftEntity.metadata.recordId.entityId,
      linkEntityTypeVersionedUrl: acquaintanceLinkEntityType.schema.$id,
    });

    expect(links).toHaveLength(0);
  });
});
