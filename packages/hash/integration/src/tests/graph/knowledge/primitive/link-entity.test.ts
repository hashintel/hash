import { TypeSystemInitializer } from "@blockprotocol/type-system";
import {
  createGraphClient,
  ensureSystemGraphIsInitialized,
  ImpureGraphContext,
} from "@hashintel/hash-api/src/graph";
import {
  archiveEntity,
  createEntity,
  getEntityOutgoingLinks,
} from "@hashintel/hash-api/src/graph/knowledge/primitive/entity";
import {
  createLinkEntity,
  getLinkEntityLeftEntity,
  getLinkEntityRightEntity,
  LinkEntity,
} from "@hashintel/hash-api/src/graph/knowledge/primitive/link-entity";
import { User } from "@hashintel/hash-api/src/graph/knowledge/system-types/user";
import { createEntityType } from "@hashintel/hash-api/src/graph/ontology/primitive/entity-type";
import {
  EntityTypeCreatorParams,
  generateSystemEntityTypeSchema,
} from "@hashintel/hash-api/src/graph/util";
import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { generateTypeId } from "@hashintel/hash-shared/ontology-types";
import { OwnedById } from "@hashintel/hash-shared/types";
import {
  Entity,
  EntityTypeWithMetadata,
  linkEntityTypeUri,
} from "@hashintel/hash-subgraph";

import { createTestUser } from "../../../util";

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

const graphContext: ImpureGraphContext = { graphApi };

describe("Link entity", () => {
  let namespace: string;

  let testUser: User;
  let testEntityType: EntityTypeWithMetadata;
  let friendLinkEntityType: EntityTypeWithMetadata;
  let acquaintanceLinkEntityType: EntityTypeWithMetadata;
  let leftEntity: Entity;
  let friendRightEntity: Entity;
  let acquaintanceRightEntity: Entity;

  const createTestEntityType = (
    params: Omit<EntityTypeCreatorParams, "entityTypeId" | "actorId">,
  ) => {
    const entityTypeId = generateTypeId({
      namespace,
      kind: "entity-type",
      title: params.title,
    });
    return createEntityType(graphContext, {
      ownedById: testUser.accountId as OwnedById,
      schema: generateSystemEntityTypeSchema({
        entityTypeId,
        ...params,
      }),
      actorId: testUser.accountId,
    });
  };

  beforeAll(async () => {
    await TypeSystemInitializer.initialize();
    await ensureSystemGraphIsInitialized({ graphApi, logger });

    testUser = await createTestUser(graphApi, "linktest", logger);

    namespace = testUser.shortname!;

    await Promise.all([
      createEntityType(graphContext, {
        ownedById: testUser.accountId as OwnedById,
        schema: {
          title: "Friends",
          description: "Friend of",
          kind: "entityType",
          type: "object",
          allOf: [{ $ref: linkEntityTypeUri }],
          properties: {},
        },
        actorId: testUser.accountId,
      }).then((linkEntityType) => {
        friendLinkEntityType = linkEntityType;
      }),
      createEntityType(graphContext, {
        ownedById: testUser.accountId as OwnedById,
        schema: {
          title: "Acquaintance",
          description: "Acquainted with",
          kind: "entityType",
          type: "object",
          allOf: [{ $ref: linkEntityTypeUri }],
          properties: {},
        },
        actorId: testUser.accountId,
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
      createEntity(graphContext, {
        ownedById: testUser.accountId as OwnedById,
        entityTypeId: testEntityType.schema.$id,
        properties: {},
        actorId: testUser.accountId,
      }).then((entity) => {
        leftEntity = entity;
      }),
      createEntity(graphContext, {
        ownedById: testUser.accountId as OwnedById,
        entityTypeId: testEntityType.schema.$id,
        properties: {},
        actorId: testUser.accountId,
      }).then((entity) => {
        friendRightEntity = entity;
      }),
      createEntity(graphContext, {
        ownedById: testUser.accountId as OwnedById,
        entityTypeId: testEntityType.schema.$id,
        properties: {},
        actorId: testUser.accountId,
      }).then((entity) => {
        acquaintanceRightEntity = entity;
      }),
    ]);
  });

  let linkEntityFriend: LinkEntity;
  let linkEntityAcquaintance: LinkEntity;

  it("can link entities", async () => {
    linkEntityFriend = await createLinkEntity(graphContext, {
      ownedById: testUser.accountId as OwnedById,
      leftEntityId: leftEntity.metadata.editionId.baseId,
      linkEntityType: friendLinkEntityType,
      rightEntityId: friendRightEntity.metadata.editionId.baseId,
      actorId: testUser.accountId,
    });

    linkEntityAcquaintance = await createLinkEntity(graphContext, {
      ownedById: testUser.accountId as OwnedById,
      leftEntityId: leftEntity.metadata.editionId.baseId,
      linkEntityType: acquaintanceLinkEntityType,
      rightEntityId: acquaintanceRightEntity.metadata.editionId.baseId,
      actorId: testUser.accountId,
    });
  });

  it("can get all entity links", async () => {
    const allLinks = await getEntityOutgoingLinks(graphContext, {
      entity: leftEntity,
    });
    expect(allLinks).toHaveLength(2);
    expect(allLinks).toContainEqual(linkEntityFriend);
    expect(allLinks).toContainEqual(linkEntityAcquaintance);
  });

  it("can get a single entity link", async () => {
    const links = await getEntityOutgoingLinks(graphContext, {
      entity: leftEntity,
      linkEntityType: friendLinkEntityType,
    });

    expect(links).toHaveLength(1);
    const linkEntity = links[0]!;

    expect(await getLinkEntityLeftEntity(graphContext, { linkEntity })).toEqual(
      leftEntity,
    );
    expect(linkEntity.metadata.entityTypeId).toEqual(
      friendLinkEntityType.schema.$id,
    );
    expect(
      await getLinkEntityRightEntity(graphContext, { linkEntity }),
    ).toEqual(friendRightEntity);
  });

  it("can archive a link", async () => {
    await archiveEntity(graphContext, {
      entity: linkEntityAcquaintance,
      actorId: testUser.accountId,
    });

    const links = await getEntityOutgoingLinks(graphContext, {
      entity: leftEntity,
      linkEntityType: acquaintanceLinkEntityType,
    });

    expect(links).toHaveLength(0);
  });
});
