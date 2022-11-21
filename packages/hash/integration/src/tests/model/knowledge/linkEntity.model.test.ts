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

  let testUser: UserModel;
  let testEntityType: EntityTypeModel;
  let linkEntityTypeFriend: EntityTypeModel;
  let linkEntityTypeAcquaintance: EntityTypeModel;
  let leftEntityModel: EntityModel;
  let rightEntityFriend: EntityModel;
  let rightEntityAcquaintance: EntityModel;

  const createEntityType = (
    params: Omit<EntityTypeCreatorParams, "entityTypeId" | "actorId">,
  ) => {
    const entityTypeId = generateTypeId({
      namespace,
      kind: "entity-type",
      title: params.title,
    });
    return EntityTypeModel.create(graphApi, {
      ownedById: testUser.entityUuid,
      schema: generateSystemEntityTypeSchema({
        entityTypeId,
        actorId: testUser.entityUuid,
        ...params,
      }),
      actorId: testUser.entityUuid,
    });
  };

  const _createEntity = (params: { entityTypeModel: EntityTypeModel }) =>
    EntityModel.create(graphApi, {
      ownedById: testUser.entityUuid,
      properties: {},
      actorId: testUser.entityUuid,
      ...params,
    });

  beforeAll(async () => {
    testUser = await createTestUser(graphApi, "linktest", logger);

    namespace = testUser.getShortname()!;

    await Promise.all([
      EntityTypeModel.create(graphApi, {
        ownedById: testUser.entityUuid,
        schema: {
          title: "Friends",
          description: "Friend of",
          kind: "entityType",
          type: "object",
          allOf: [{ $ref: linkEntityTypeUri }],
          properties: {},
        },
        actorId: testUser.entityUuid,
      }).then((linkEntityType) => {
        linkEntityTypeFriend = linkEntityType;
      }),
      EntityTypeModel.create(graphApi, {
        ownedById: testUser.entityUuid,
        schema: {
          title: "Acquaintance",
          description: "Acquainted with",
          kind: "entityType",
          type: "object",
          allOf: [{ $ref: linkEntityTypeUri }],
          properties: {},
        },
        actorId: testUser.entityUuid,
      }).then((linkEntityType) => {
        linkEntityTypeAcquaintance = linkEntityType;
      }),
    ]);

    testEntityType = await createEntityType({
      title: "Person",
      properties: [],
      outgoingLinks: [
        {
          linkEntityTypeModel: linkEntityTypeFriend,
          destinationEntityTypeModels: ["SELF_REFERENCE"],
          ordered: false,
        },
        {
          linkEntityTypeModel: linkEntityTypeAcquaintance,
          destinationEntityTypeModels: ["SELF_REFERENCE"],
          ordered: false,
        },
      ],
    });

    await Promise.all([
      EntityModel.create(graphApi, {
        ownedById: testUser.entityUuid,
        entityTypeModel: testEntityType,
        properties: {},
        actorId: testUser.entityUuid,
      }).then((entity) => {
        leftEntityModel = entity;
      }),
      EntityModel.create(graphApi, {
        ownedById: testUser.entityUuid,
        entityTypeModel: testEntityType,
        properties: {},
        actorId: testUser.entityUuid,
      }).then((entity) => {
        rightEntityFriend = entity;
      }),
      EntityModel.create(graphApi, {
        ownedById: testUser.entityUuid,
        entityTypeModel: testEntityType,
        properties: {},
        actorId: testUser.entityUuid,
      }).then((entity) => {
        rightEntityAcquaintance = entity;
      }),
    ]);
  });

  let friendLinkEntityModel: LinkEntityModel;
  let acquaintanceEntityLinkModel: LinkEntityModel;

  it("can link entities", async () => {
    friendLinkEntityModel = await LinkEntityModel.createLinkEntity(graphApi, {
      ownedById: testUser.entityUuid,
      leftEntityModel,
      linkEntityTypeModel: linkEntityTypeFriend,
      rightEntityModel: rightEntityFriend,
      actorId: testUser.entityUuid,
    });

    acquaintanceEntityLinkModel = await LinkEntityModel.createLinkEntity(
      graphApi,
      {
        ownedById: testUser.entityUuid,
        leftEntityModel,
        linkEntityTypeModel: linkEntityTypeAcquaintance,
        rightEntityModel: rightEntityAcquaintance,
        actorId: testUser.entityUuid,
      },
    );
  });

  it("can get all entity links", async () => {
    const allLinks = await leftEntityModel.getOutgoingLinks(graphApi);
    expect(allLinks).toHaveLength(2);
    expect(allLinks).toContainEqual(friendLinkEntityModel);
    expect(allLinks).toContainEqual(acquaintanceEntityLinkModel);
  });

  it("can get a single entity link", async () => {
    const links = await leftEntityModel.getOutgoingLinks(graphApi, {
      linkEntityTypeModel: linkEntityTypeFriend,
    });

    expect(links).toHaveLength(1);
    const link = links[0];

    expect(link?.leftEntityModel).toEqual(leftEntityModel);
    expect(link?.entityTypeModel).toEqual(linkEntityTypeFriend);
    expect(link?.rightEntityModel).toEqual(rightEntityFriend);
  });

  it("can archive a link", async () => {
    await acquaintanceEntityLinkModel.archive(graphApi, {
      actorId: testUser.entityUuid,
    });

    const links = await leftEntityModel.getOutgoingLinks(graphApi, {
      linkEntityTypeModel: linkEntityTypeAcquaintance,
    });

    expect(links).toHaveLength(0);
  });
});
