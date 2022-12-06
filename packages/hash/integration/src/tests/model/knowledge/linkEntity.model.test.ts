import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import {
  createGraphClient,
  ensureSystemGraphIsInitialized,
} from "@hashintel/hash-api/src/graph";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import {
  EntityModel,
  EntityTypeModel,
  LinkEntityModel,
  UserModel,
} from "@hashintel/hash-api/src/model";
import {
  EntityTypeCreatorParams,
  generateSystemEntityTypeSchema,
  linkEntityTypeUri,
} from "@hashintel/hash-api/src/model/util";
import { generateTypeId } from "@hashintel/hash-shared/types";
import { TypeSystemInitializer } from "@blockprotocol/type-system";
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
  let testEntityTypeModel: EntityTypeModel;
  let friendLinkEntityTypeModel: EntityTypeModel;
  let acquaintanceLinkEntityTypeModel: EntityTypeModel;
  let leftEntityModel: EntityModel;
  let friendRightEntityModel: EntityModel;
  let acquaintanceRightEntityModel: EntityModel;

  const createEntityType = (
    params: Omit<EntityTypeCreatorParams, "entityTypeId" | "actorId">,
  ) => {
    const entityTypeId = generateTypeId({
      namespace,
      kind: "entity-type",
      title: params.title,
    });
    return EntityTypeModel.create(graphApi, {
      ownedById: testUserModel.getEntityUuid(),
      schema: generateSystemEntityTypeSchema({
        entityTypeId,
        ...params,
      }),
      actorId: testUserModel.getEntityUuid(),
    });
  };

  beforeAll(async () => {
    await TypeSystemInitializer.initialize();
    await ensureSystemGraphIsInitialized({ graphApi, logger });

    testUserModel = await createTestUser(graphApi, "linktest", logger);

    namespace = testUserModel.getShortname()!;

    await Promise.all([
      EntityTypeModel.create(graphApi, {
        ownedById: testUserModel.getEntityUuid(),
        schema: {
          title: "Friends",
          description: "Friend of",
          kind: "entityType",
          type: "object",
          allOf: [{ $ref: linkEntityTypeUri }],
          properties: {},
        },
        actorId: testUserModel.getEntityUuid(),
      }).then((linkEntityType) => {
        friendLinkEntityTypeModel = linkEntityType;
      }),
      EntityTypeModel.create(graphApi, {
        ownedById: testUserModel.getEntityUuid(),
        schema: {
          title: "Acquaintance",
          description: "Acquainted with",
          kind: "entityType",
          type: "object",
          allOf: [{ $ref: linkEntityTypeUri }],
          properties: {},
        },
        actorId: testUserModel.getEntityUuid(),
      }).then((linkEntityType) => {
        acquaintanceLinkEntityTypeModel = linkEntityType;
      }),
    ]);

    testEntityTypeModel = await createEntityType({
      title: "Person",
      properties: [],
      outgoingLinks: [
        {
          linkEntityTypeModel: friendLinkEntityTypeModel,
          destinationEntityTypeModels: ["SELF_REFERENCE"],
          ordered: false,
        },
        {
          linkEntityTypeModel: acquaintanceLinkEntityTypeModel,
          destinationEntityTypeModels: ["SELF_REFERENCE"],
          ordered: false,
        },
      ],
    });

    await Promise.all([
      EntityModel.create(graphApi, {
        ownedById: testUserModel.getEntityUuid(),
        entityTypeModel: testEntityTypeModel,
        properties: {},
        actorId: testUserModel.getEntityUuid(),
      }).then((entity) => {
        leftEntityModel = entity;
      }),
      EntityModel.create(graphApi, {
        ownedById: testUserModel.getEntityUuid(),
        entityTypeModel: testEntityTypeModel,
        properties: {},
        actorId: testUserModel.getEntityUuid(),
      }).then((entity) => {
        friendRightEntityModel = entity;
      }),
      EntityModel.create(graphApi, {
        ownedById: testUserModel.getEntityUuid(),
        entityTypeModel: testEntityTypeModel,
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
      ownedById: testUserModel.getEntityUuid(),
      leftEntityModel,
      linkEntityTypeModel: friendLinkEntityTypeModel,
      rightEntityModel: friendRightEntityModel,
      actorId: testUserModel.getEntityUuid(),
    });

    linkEntityAcquaintanceModel = await LinkEntityModel.createLinkEntity(
      graphApi,
      {
        ownedById: testUserModel.getEntityUuid(),
        leftEntityModel,
        linkEntityTypeModel: acquaintanceLinkEntityTypeModel,
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
      linkEntityTypeModel: friendLinkEntityTypeModel,
    });

    expect(links).toHaveLength(1);
    const link = links[0];

    expect(link?.leftEntityModel).toEqual(leftEntityModel);
    expect(link?.entityTypeModel).toEqual(friendLinkEntityTypeModel);
    expect(link?.rightEntityModel).toEqual(friendRightEntityModel);
  });

  it("can archive a link", async () => {
    await linkEntityAcquaintanceModel.archive(graphApi, {
      actorId: testUserModel.getEntityUuid(),
    });

    const links = await leftEntityModel.getOutgoingLinks(graphApi, {
      linkEntityTypeModel: acquaintanceLinkEntityTypeModel,
    });

    expect(links).toHaveLength(0);
  });
});
