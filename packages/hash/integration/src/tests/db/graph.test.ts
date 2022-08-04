import { Logger } from "@hashintel/hash-backend-utils/logger";
import { DbClient, GraphClient } from "@hashintel/hash-api/src/db";
import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { DataType, LinkType, PropertyType } from "@hashintel/hash-graph-client";

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

const db: DbClient = new GraphClient(
  { basePath: getRequiredEnv("HASH_GRAPH_API_BASE_URL") },
  logger,
);

const accountId = { accountId: "00000000-0000-0000-0000-000000000000" };

const textDataType$id = "https://example.com/data-type/v/1";

describe("Data type CRU", () => {
  const dataType = ($id: string): DataType => {
    return {
      $id,
      kind: "dataType",
      title: "Text",
      type: "string",
    };
  };

  const createdDataType$id = textDataType$id;
  it("can create a data type", async () => {
    await db.createDataType({
      ...accountId,
      schema: dataType(createdDataType$id),
    });
  });

  it("can read a data type", async () => {
    const fetchedDataType = await db.getDataType({
      ...accountId,
      versionedUri: createdDataType$id,
    });

    expect(fetchedDataType.$id).toEqual(createdDataType$id);
  });

  const updatedDataType$id = "https://example.com/data-type/v/2";
  const updatedTitle = "New text!";
  it("can update a data type", async () => {
    await db
      .updateDataType({
        ...accountId,
        schema: { ...dataType(updatedDataType$id), title: updatedTitle },
      })
      .catch((err) => logger.error(err.data));
  });

  it("can read all latest data types", async () => {
    const allDataTypes = await db.getLatestDataTypes(accountId);

    expect(allDataTypes).toHaveLength(1);
    expect(allDataTypes[0]!.$id).toEqual(updatedDataType$id);
    expect(allDataTypes[0]!.title).toEqual(updatedTitle);
  });
});

describe("Property type CRU", () => {
  const propertyType = ($id: string): PropertyType => {
    return {
      $id,
      kind: "propertyType",
      title: "A property type",
      oneOf: [
        {
          $ref: textDataType$id,
        },
      ],
    };
  };

  const createdPropertyType$id = "https://example.com/property-type/v/1";
  it("can create a property type", async () => {
    await db.createPropertyType({
      ...accountId,
      schema: propertyType(createdPropertyType$id),
    });
  });

  it("can read a property type", async () => {
    const fetchedPropertyType = await db.getPropertyType({
      ...accountId,
      versionedUri: createdPropertyType$id,
    });

    expect(fetchedPropertyType.$id).toEqual(createdPropertyType$id);
  });

  const updatedPropertyType$id = "https://example.com/property-type/v/2";
  const updatedTitle = "New test!";
  it("can update a property type", async () => {
    await db
      .updatePropertyType({
        ...accountId,
        schema: {
          ...propertyType(updatedPropertyType$id),
          title: updatedTitle,
        },
      })
      .catch((err) => logger.error(err.data));
  });

  it("can read all latest property types", async () => {
    const allPropertyTypes = await db.getLatestPropertyTypes(accountId);

    expect(allPropertyTypes).toHaveLength(1);
    expect(allPropertyTypes[0]!.$id).toEqual(updatedPropertyType$id);
    expect(allPropertyTypes[0]!.title).toEqual(updatedTitle);
  });
});

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
  it("can create a link type", async () => {
    await db.createLinkType({
      ...accountId,
      schema: linkType(createdLinkType$id),
    });
  });

  it("can read a link type", async () => {
    const fetchedLinkType = await db.getLinkType({
      ...accountId,
      versionedUri: createdLinkType$id,
    });

    expect(fetchedLinkType.$id).toEqual(createdLinkType$id);
  });

  const updatedLinkType$id = "https://example.com/link-type/v/2";
  const updatedTitle = "A new link!";
  it("can update a link type", async () => {
    await db
      .updateLinkType({
        ...accountId,
        schema: {
          ...linkType(updatedLinkType$id),
          title: updatedTitle,
        },
      })
      .catch((err) => logger.error(err.data));
  });

  it("can read all latest link types", async () => {
    const allLinkTypes = await db.getLatestLinkTypes(accountId);

    expect(allLinkTypes).toHaveLength(1);
    expect(allLinkTypes[0]!.$id).toEqual(updatedLinkType$id);
    expect(allLinkTypes[0]!.title).toEqual(updatedTitle);
  });
});
