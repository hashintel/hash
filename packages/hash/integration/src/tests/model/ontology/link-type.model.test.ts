import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import { LinkType } from "@hashintel/hash-graph-client/";
import { LinkTypeModel } from "@hashintel/hash-api/src/model";

jest.setTimeout(60000);

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

const graphApi = createGraphClient(
  { basePath: getRequiredEnv("HASH_GRAPH_API_BASE_URL") },
  logger,
);

const accountId = "00000000-0000-0000-0000-000000000000";

describe("Link type CRU", () => {
  const linkType = ($id: string): LinkType => {
    return {
      $id,
      kind: "linkType",
      title: "A link",
      description: "A link between things",
    };
  };

  const createdLinkType$id = "https://example.com/link-type/v/1";
  let createdLinkType: LinkTypeModel;
  it("can create a link type", async () => {
    createdLinkType = await LinkTypeModel.create(graphApi, {
      accountId,
      schema: linkType(createdLinkType$id),
    });
  });

  it("can read a link type", async () => {
    const fetchedLinkType = await LinkTypeModel.get(graphApi, {
      versionedUri: createdLinkType$id,
    });

    expect(fetchedLinkType.schema.$id).toEqual(createdLinkType$id);
  });

  const updated$id = "https://example.com/link-type/v/2";
  const updatedTitle = "A new link!";
  it("can update a link type", async () => {
    await createdLinkType
      .update(graphApi, {
        accountId,
        schema: {
          ...linkType(updated$id),
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
      (lt) => lt.schema.$id === updated$id,
    );

    expect(allLinkTypes.length).toBeGreaterThan(0);
    expect(newlyUpdated).toBeDefined();

    expect(newlyUpdated!.schema.$id).toEqual(updated$id);
    expect(newlyUpdated!.schema.title).toEqual(updatedTitle);
  });
});
