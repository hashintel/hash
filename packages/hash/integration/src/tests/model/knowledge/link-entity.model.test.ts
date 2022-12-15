import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import {
  createGraphClient,
  ensureSystemGraphIsInitialized,
} from "@hashintel/hash-api/src/graph";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import {
  EntityModel,
  LinkEntityModel,
  UserModel,
} from "@hashintel/hash-api/src/model";
import {
  EntityTypeCreatorParams,
  generateSystemEntityTypeSchema,
  linkEntityTypeUri,
} from "@hashintel/hash-api/src/model/util";
import { brand } from "@hashintel/hash-shared/types";

import { generateTypeId } from "@hashintel/hash-shared/ontology-types";
import { TypeSystemInitializer } from "@blockprotocol/type-system";
import { EntityTypeWithMetadata } from "@hashintel/hash-subgraph";
import { createEntityType } from "@hashintel/hash-api/src/graph/ontology/primitive/entity-type";
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

describe("Link entity model class", () => {
  let namespace: string;

  let testUserModel: UserModel;
  let testEntityType: EntityTypeWithMetadata;
  let friendLinkEntityType: EntityTypeWithMetadata;
  let acquaintanceLinkEntityType: EntityTypeWithMetadata;
  let leftEntityModel: EntityModel;
  let friendRightEntityModel: EntityModel;
  let acquaintanceRightEntityModel: EntityModel;

  const createTestEntityType = (
    params: Omit<EntityTypeCreatorParams, "entityTypeId" | "actorId">,
  ) => {
    const entityTypeId = generateTypeId({
      namespace,
      kind: "entity-type",
      title: params.title,
    });
    return createEntityType(
      { graphApi },
      {
        ownedById: brand(testUserModel.getEntityUuid()),
        schema: generateSystemEntityTypeSchema({
          entityTypeId,
          ...params,
        }),
        actorId: brand(testUserModel.getEntityUuid()),
      },
    );
  };

  beforeAll(async () => {
    await TypeSystemInitializer.initialize();
    await ensureSystemGraphIsInitialized({ graphApi, logger });

    testUserModel = await createTestUser(graphApi, "linktest", logger);

    namespace = testUserModel.getShortname()!;

    await Promise.all([
      createEntityType(
        { graphApi },
        {
          ownedById: brand(testUserModel.getEntityUuid()),
          schema: {
            title: "Friends",
            description: "Friend of",
            kind: "entityType",
            type: "object",
            allOf: [{ $ref: linkEntityTypeUri }],
            properties: {},
          },
          actorId: brand(testUserModel.getEntityUuid()),
        },
      ).then((linkEntityType) => {
        friendLinkEntityType = linkEntityType;
      }),
      createEntityType(
        { graphApi },
        {
          ownedById: brand(testUserModel.getEntityUuid()),
          schema: {
            title: "Acquaintance",
            description: "Acquainted with",
            kind: "entityType",
            type: "object",
            allOf: [{ $ref: linkEntityTypeUri }],
            properties: {},
          },
          actorId: brand(testUserModel.getEntityUuid()),
        },
      ).then((linkEntityType) => {
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
      EntityModel.create(graphApi, {
        ownedById: brand(testUserModel.getEntityUuid()),
        entityType: testEntityType,
        properties: {},
        actorId: testUserModel.getEntityUuid(),
      }).then((entity) => {
        leftEntityModel = entity;
      }),
      EntityModel.create(graphApi, {
        ownedById: brand(testUserModel.getEntityUuid()),
        entityType: testEntityType,
        properties: {},
        actorId: testUserModel.getEntityUuid(),
      }).then((entity) => {
        friendRightEntityModel = entity;
      }),
      EntityModel.create(graphApi, {
        ownedById: brand(testUserModel.getEntityUuid()),
        entityType: testEntityType,
        properties: {},
        actorId: testUserModel.getEntityUuid(),
      }).then((entity) => {
        acquaintanceRightEntityModel = entity;
      }),
    ]);
  });

  let linkEntityFriendModel: LinkEntityModel;
  let linkEntityAcquaintanceModel: LinkEntityModel;

  it("can link entities", async () => {
    linkEntityFriendModel = await LinkEntityModel.createLinkEntity(graphApi, {
      ownedById: brand(testUserModel.getEntityUuid()),
      leftEntityModel,
      linkEntityType: friendLinkEntityType,
      rightEntityModel: friendRightEntityModel,
      actorId: testUserModel.getEntityUuid(),
    });

    linkEntityAcquaintanceModel = await LinkEntityModel.createLinkEntity(
      graphApi,
      {
        ownedById: brand(testUserModel.getEntityUuid()),
        leftEntityModel,
        linkEntityType: acquaintanceLinkEntityType,
        rightEntityModel: acquaintanceRightEntityModel,
        actorId: testUserModel.getEntityUuid(),
      },
    );
  });

  it("can get all entity links", async () => {
    const allLinks = await leftEntityModel.getOutgoingLinks(graphApi);
    expect(allLinks).toHaveLength(2);
    expect(allLinks).toContainEqual(linkEntityFriendModel);
    expect(allLinks).toContainEqual(linkEntityAcquaintanceModel);
  });

  it("can get a single entity link", async () => {
    const links = await leftEntityModel.getOutgoingLinks(graphApi, {
      linkEntityType: friendLinkEntityType,
    });

    expect(links).toHaveLength(1);
    const link = links[0];

    expect(link?.leftEntityModel).toEqual(leftEntityModel);
    expect(link?.entityType).toEqual(friendLinkEntityType);
    expect(link?.rightEntityModel).toEqual(friendRightEntityModel);
  });

  it("can archive a link", async () => {
    await linkEntityAcquaintanceModel.archive(graphApi, {
      actorId: testUserModel.getEntityUuid(),
    });

    const links = await leftEntityModel.getOutgoingLinks(graphApi, {
      linkEntityType: acquaintanceLinkEntityType,
    });

    expect(links).toHaveLength(0);
  });
});
