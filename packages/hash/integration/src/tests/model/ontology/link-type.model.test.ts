import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import { LinkType } from "@hashintel/hash-graph-client/";
import { LinkTypeModel, UserModel } from "@hashintel/hash-api/src/model";
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

let testUser: UserModel;
let testUser2: UserModel;

const linkTypeSchema: Omit<LinkType, "$id"> = {
  kind: "linkType",
  title: "A link",
  pluralTitle: "Multiple Links",
  description: "A link between things",
};

beforeAll(async () => {
  testUser = await createTestUser(graphApi, "link-type-test", logger);
  testUser2 = await createTestUser(graphApi, "link-type-test", logger);
});

describe("Link type CRU", () => {
  let createdLinkTypeModel: LinkTypeModel;
  let updatedLinkTypeModel: LinkTypeModel;

  it("can create a link type", async () => {
    createdLinkTypeModel = await LinkTypeModel.create(graphApi, {
      ownedById: testUser.entityId,
      schema: linkTypeSchema,
      createdById: testUser.entityId,
    });
  });

  it("can read a link type", async () => {
    const fetchedLinkType = await LinkTypeModel.get(graphApi, {
      linkTypeId: createdLinkTypeModel.schema.$id,
    });

    expect(fetchedLinkType.schema).toEqual(createdLinkTypeModel.schema);
  });

  const updatedTitle = "A new link!";

  it("can update a link type", async () => {
    expect(createdLinkTypeModel.createdById).toBe(testUser.entityId);
    expect(createdLinkTypeModel.updatedById).toBe(testUser.entityId);

    updatedLinkTypeModel = await createdLinkTypeModel
      .update(graphApi, {
        schema: {
          ...linkTypeSchema,
          title: updatedTitle,
        },
        updatedById: testUser.entityId,
      })
      .catch((err) => Promise.reject(err.data));

    expect(updatedLinkTypeModel.createdById).toBe(testUser.entityId);
    expect(updatedLinkTypeModel.updatedById).toBe(testUser2.entityId);
  });

  it("can read all latest link types", async () => {
    const allLinkTypes = await LinkTypeModel.getAllLatest(graphApi);

    const newlyUpdated = allLinkTypes.find(
      (lt) => lt.schema.$id === updatedLinkTypeModel.schema.$id,
    );

    expect(allLinkTypes.length).toBeGreaterThan(0);
    expect(newlyUpdated).toBeDefined();

    expect(newlyUpdated!.schema).toEqual(updatedLinkTypeModel.schema);
    expect(newlyUpdated!.schema.title).toEqual(updatedTitle);
  });
});
