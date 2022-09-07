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

const entityType$id = "https://link~example.com/entity-type-person/v/1";

describe("Link model class", () => {
  let testType: EntityTypeModel;
  let linkTypeFriend: LinkTypeModel;
  let linkTypeAcquaintance: LinkTypeModel;
  let sourceEntityModel: EntityModel;
  let targetEntityFriend: EntityModel;
  let targetEntityAcquaintance: EntityModel;

  beforeAll(async () => {
    testType = await EntityTypeModel.create(graphApi, {
      accountId,
      schema: {
        $id: entityType$id,
        kind: "entityType",
        title: "Person",
        pluralTitle: "People",
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
          title: "Friends",
          pluralTitle: "Friends",
          description: "Friend of",
        },
      }),

      LinkTypeModel.create(graphApi, {
        accountId,
        schema: {
          $id: "https://link~example.com/link-types/acquaintance/v/1",
          kind: "linkType",
          title: "Acquaintance",
          pluralTitle: "Acquaintances",
          description: "Acquainted with",
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

    linkTypeFriend = results[0];
    linkTypeAcquaintance = results[1];
    sourceEntityModel = results[2];
    targetEntityFriend = results[3];
    targetEntityAcquaintance = results[4];
  });

  let friendLink: LinkModel;
  let acquaintanceLink: LinkModel;
  it("can link entities", async () => {
    friendLink = await LinkModel.create(graphApi, {
      createdBy: accountId,
      sourceEntityModel,
      linkTypeModel: linkTypeFriend,
      targetEntityModel: targetEntityFriend,
    });

    acquaintanceLink = await LinkModel.create(graphApi, {
      createdBy: accountId,
      sourceEntityModel,
      linkTypeModel: linkTypeAcquaintance,
      targetEntityModel: targetEntityAcquaintance,
    });
  });

  it("can get all entity links", async () => {
    const allLinks = await LinkModel.getAllOutgoing(graphApi, {
      sourceEntityModel,
    });

    expect(allLinks).toHaveLength(2);
    expect(allLinks).toContainEqual(friendLink);
    expect(allLinks).toContainEqual(acquaintanceLink);
  });

  it("can get a single entity link", async () => {
    const links = await LinkModel.getOutgoing(graphApi, {
      sourceEntityModel,
      linkTypeModel: linkTypeFriend,
    });

    expect(links).toHaveLength(1);
    const link = links[0];

    expect(link?.sourceEntityModel).toEqual(sourceEntityModel);
    expect(link?.linkTypeModel).toEqual(linkTypeFriend);
    expect(link?.targetEntityModel).toEqual(targetEntityFriend);
  });

  it("can remove a link", async () => {
    await acquaintanceLink.remove(graphApi, { removedBy: accountId });

    const links = await LinkModel.getOutgoing(graphApi, {
      sourceEntityModel,
      linkTypeModel: linkTypeAcquaintance,
    });

    expect(links).toHaveLength(0);
  });
});
