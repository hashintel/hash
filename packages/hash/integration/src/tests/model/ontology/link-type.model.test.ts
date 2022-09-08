import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import { LinkType } from "@hashintel/hash-graph-client/";
import { LinkTypeModel } from "@hashintel/hash-api/src/model";
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

let accountId: string;
const linkTypeSchema: Omit<LinkType, "$id"> = {
  kind: "linkType",
  title: "A link",
  pluralTitle: "Multiple Links",
  description: "A link between things",
};

beforeAll(async () => {
  accountId = await createTestUser(graphApi, "link-type-test", logger);
});

describe("Link type CRU", () => {
  let createdLinkTypeModel: LinkTypeModel;
  let updatedLinkTypeModel: LinkTypeModel;

  it("can create a link type", async () => {
    createdLinkTypeModel = await LinkTypeModel.create(graphApi, {
      accountId,
      schema: linkTypeSchema,
    });
  });

  it("can read a link type", async () => {
    const fetchedLinkType = await LinkTypeModel.get(graphApi, {
      versionedUri: createdLinkTypeModel.schema.$id,
    });

    expect(fetchedLinkType.schema).toEqual(createdLinkTypeModel.schema);
  });

  const updatedTitle = "A new link!";

  it("can update a link type", async () => {
    updatedLinkTypeModel = await createdLinkTypeModel
      .update(graphApi, {
        accountId,
        schema: {
          ...linkTypeSchema,
          title: updatedTitle,
        },
      })
      .catch((err) => Promise.reject(err.data));
  });

  it("can read all latest link types", async () => {
    const allLinkTypes = await LinkTypeModel.getAllLatest(graphApi, {
      accountId,
    });

    const newlyUpdated = allLinkTypes.find(
      (lt) => lt.schema.$id === updatedLinkTypeModel.schema.$id,
    );

    expect(allLinkTypes.length).toBeGreaterThan(0);
    expect(newlyUpdated).toBeDefined();

    expect(newlyUpdated!.schema).toEqual(updatedLinkTypeModel.schema);
    expect(newlyUpdated!.schema.title).toEqual(updatedTitle);
  });
});
