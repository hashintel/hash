import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
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
      ownedById: testUserModel.entityUuid,
      schema: generateSystemEntityTypeSchema({
        entityTypeId,
        actorId: testUserModel.entityUuid,
        ...params,
      }),
      actorId: testUserModel.entityUuid,
    });
  };

  beforeAll(async () => {
    testUserModel = await createTestUser(graphApi, "linktest", logger);

    namespace = testUserModel.getShortname()!;

    await Promise.all([
      EntityTypeModel.create(graphApi, {
        ownedById: testUserModel.entityUuid,
        schema: {
          title: "Friends",
          description: "Friend of",
          kind: "entityType",
          type: "object",
          allOf: [{ $ref: linkEntityTypeUri }],
          properties: {},
        },
        actorId: testUserModel.entityUuid,
      }).then((linkEntityType) => {
        friendLinkEntityTypeModel = linkEntityType;
      }),
      EntityTypeModel.create(graphApi, {
        ownedById: testUserModel.entityUuid,
        schema: {
          title: "Acquaintance",
          description: "Acquainted with",
          kind: "entityType",
          type: "object",
          allOf: [{ $ref: linkEntityTypeUri }],
          properties: {},
        },
        actorId: testUserModel.entityUuid,
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
        ownedById: testUserModel.entityUuid,
        entityTypeModel: testEntityTypeModel,
        properties: {},
        actorId: testUserModel.entityUuid,
      }).then((entity) => {
        leftEntityModel = entity;
      }),
      EntityModel.create(graphApi, {
        ownedById: testUserModel.entityUuid,
        entityTypeModel: testEntityTypeModel,
        properties: {},
        actorId: testUserModel.entityUuid,
      }).then((entity) => {
        friendRightEntityModel = entity;
      }),
      EntityModel.create(graphApi, {
        ownedById: testUserModel.entityUuid,
        entityTypeModel: testEntityTypeModel,
        properties: {},
        actorId: testUserModel.entityUuid,
      }).then((entity) => {
        acquaintanceRightEntityModel = entity;
      }),
    ]);
  });

  let linkEntityFriendModel: LinkEntityModel;
  let linkEntityAcquaintanceModel: LinkEntityModel;

  it("can link entities", async () => {
    linkEntityFriendModel = await LinkEntityModel.createLinkEntity(graphApi, {
      ownedById: testUserModel.entityUuid,
      leftEntityModel,
      linkEntityTypeModel: friendLinkEntityTypeModel,
      rightEntityModel: friendRightEntityModel,
      actorId: testUserModel.entityUuid,
    });

    linkEntityAcquaintanceModel = await LinkEntityModel.createLinkEntity(
      graphApi,
      {
        ownedById: testUserModel.entityUuid,
        leftEntityModel,
        linkEntityTypeModel: acquaintanceLinkEntityTypeModel,
        rightEntityModel: acquaintanceRightEntityModel,
        actorId: testUserModel.entityUuid,
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
      actorId: testUserModel.entityUuid,
    });

    const links = await leftEntityModel.getOutgoingLinks(graphApi, {
      linkEntityTypeModel: acquaintanceLinkEntityTypeModel,
    });

    expect(links).toHaveLength(0);
  });
});
