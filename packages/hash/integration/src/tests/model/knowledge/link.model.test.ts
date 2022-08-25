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
  let knowsLinkType: LinkTypeModel;
  let sourceEntity: EntityModel;
  let targetEntity: EntityModel;

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

    knowsLinkType = results[0];
    sourceEntity = results[1];
    targetEntity = results[2];
  });

  it("can link entities", async () => {
    await LinkModel.create(graphApi, {
      accountId,
      sourceEntity,
      linkTypeModel: knowsLinkType,
      targetEntity,
    });
  });
});
