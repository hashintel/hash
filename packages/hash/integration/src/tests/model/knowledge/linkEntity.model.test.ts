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
  let linkEntityTypeFriendModel: EntityTypeModel;
  let linkEntityTypeAcquaintanceModel: EntityTypeModel;
  let leftEntityModel: EntityModel;
  let rightEntityFriendModel: EntityModel;
  let rightEntityAcquaintanceModel: EntityModel;

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

  const _createEntity = (params: { entityTypeModel: EntityTypeModel }) =>
    EntityModel.create(graphApi, {
      ownedById: testUserModel.entityUuid,
      properties: {},
      actorId: testUserModel.entityUuid,
      ...params,
    });

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
        linkEntityTypeFriendModel = linkEntityType;
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
        linkEntityTypeAcquaintanceModel = linkEntityType;
      }),
    ]);

    testEntityTypeModel = await createEntityType({
      title: "Person",
      properties: [],
      outgoingLinks: [
        {
          linkEntityTypeModel: linkEntityTypeFriendModel,
          destinationEntityTypeModels: ["SELF_REFERENCE"],
          ordered: false,
        },
        {
          linkEntityTypeModel: linkEntityTypeAcquaintanceModel,
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
        rightEntityFriendModel = entity;
      }),
      EntityModel.create(graphApi, {
        ownedById: testUserModel.entityUuid,
        entityTypeModel: testEntityTypeModel,
        properties: {},
        actorId: testUserModel.entityUuid,
      }).then((entity) => {
        rightEntityAcquaintanceModel = entity;
      }),
    ]);
  });

  let linkEntityFriendModel: LinkEntityModel;
  let linkEntityAcquaintanceModel: LinkEntityModel;

  it("can link entities", async () => {
    linkEntityFriendModel = await LinkEntityModel.createLinkEntity(graphApi, {
      ownedById: testUserModel.entityUuid,
      leftEntityModel,
      linkEntityTypeModel: linkEntityTypeFriendModel,
      rightEntityModel: rightEntityFriendModel,
      actorId: testUserModel.entityUuid,
    });

    linkEntityAcquaintanceModel = await LinkEntityModel.createLinkEntity(
      graphApi,
      {
        ownedById: testUserModel.entityUuid,
        leftEntityModel,
        linkEntityTypeModel: linkEntityTypeAcquaintanceModel,
        rightEntityModel: rightEntityAcquaintanceModel,
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
      linkEntityTypeModel: linkEntityTypeFriendModel,
    });

    expect(links).toHaveLength(1);
    const link = links[0];

    expect(link?.leftEntityModel).toEqual(leftEntityModel);
    expect(link?.entityTypeModel).toEqual(linkEntityTypeFriendModel);
    expect(link?.rightEntityModel).toEqual(rightEntityFriendModel);
  });

  it("can archive a link", async () => {
    await linkEntityAcquaintanceModel.archive(graphApi, {
      actorId: testUserModel.entityUuid,
    });

    const links = await leftEntityModel.getOutgoingLinks(graphApi, {
      linkEntityTypeModel: linkEntityTypeAcquaintanceModel,
    });

    expect(links).toHaveLength(0);
  });
});
