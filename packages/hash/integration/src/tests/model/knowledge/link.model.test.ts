import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import {
  EntityModel,
  EntityTypeModel,
  LinkModel,
  LinkTypeModel,
} from "@hashintel/hash-api/src/model";

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

const accountId = "00000000-0000-0000-0000-000000000000";

const entityType$id = "https://link~example.com/entity-type/v/1";

describe("Link model class", () => {
  let testType: EntityTypeModel;
  let friendsLinkType: LinkTypeModel;
  let knowsLinkType: LinkTypeModel;
  let sourceEntity: EntityModel;
  let targetEntityFriend: EntityModel;
  let targetEntityAcquaintance: EntityModel;

  beforeAll(async () => {
    testType = await EntityTypeModel.create(graphApi, {
      accountId,
      schema: {
        $id: entityType$id,
        kind: "entityType",
        title: "Text",
        type: "object",
        properties: {},
      },
    });

    const results = await Promise.all([
      LinkTypeModel.create(graphApi, {
        accountId,
        schema: {
          $id: "https://link~example.com/link-types/friends-with/v/1",
          kind: "linkType",
          title: "Friends with",
          description: "A friendship",
        },
      }),

      LinkTypeModel.create(graphApi, {
        accountId,
        schema: {
          $id: "https://link~example.com/link-types/acquaintance/v/1",
          kind: "linkType",
          title: "Acquaintance",
          description: "Acquaintance",
        },
      }),

      EntityModel.create(graphApi, {
        accountId,
        entityTypeModel: testType,
        properties: {},
      }),

      EntityModel.create(graphApi, {
        accountId,
        entityTypeModel: testType,
        properties: {},
      }),

      EntityModel.create(graphApi, {
        accountId,
        entityTypeModel: testType,
        properties: {},
      }),
    ]);

    friendsLinkType = results[0];
    knowsLinkType = results[1];
    sourceEntity = results[2];
    targetEntityFriend = results[3];
    targetEntityAcquaintance = results[4];
  });

  it("can link entities", async () => {
    await LinkModel.create(graphApi, {
      accountId,
      sourceEntity,
      linkTypeModel: friendsLinkType,
      targetEntity: targetEntityFriend,
    });

    await LinkModel.create(graphApi, {
      accountId,
      sourceEntity,
      linkTypeModel: knowsLinkType,
      targetEntity: targetEntityAcquaintance,
    });
  });

  it("can get all entity links", async () => {
    const allLinks = await LinkModel.getAllOutgoing(graphApi, {
      sourceEntity,
    });

    expect(allLinks).toHaveLength(2);

    const targetEntities = allLinks.map((link) => link.targetEntity);
    expect(targetEntities).toContainEqual(targetEntityFriend);
    expect(targetEntities).toContainEqual(targetEntityAcquaintance);

    const linkTypes = allLinks.map((link) => link.linkTypeModel);
    expect(linkTypes).toContainEqual(friendsLinkType);
    expect(linkTypes).toContainEqual(knowsLinkType);
  });

  it("can get a single entity link", async () => {
    const link = await LinkModel.get(graphApi, {
      sourceEntity,
      linkTypeModel: friendsLinkType,
    });

    expect(link!.sourceEntity).toEqual(sourceEntity);
    expect(link!.linkTypeModel).toEqual(friendsLinkType);
    expect(link!.targetEntity).toEqual(targetEntityFriend);
  });
});
