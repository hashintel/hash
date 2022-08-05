import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/hashGraph";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import { PropertyType as PropertyTypeSchema } from "@hashintel/hash-graph-client/";
import { DataType, PropertyType } from "@hashintel/hash-api/src/model";

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

const accountId = { accountId: "00000000-0000-0000-0000-000000000000" };

const textDataType$id = "https://property-type~example.com/data-type/v/1";

beforeAll(async () => {
  await DataType.create(graphApi, {
    ...accountId,
    schema: {
      $id: textDataType$id,
      kind: "dataType",
      title: "Text",
      type: "string",
    },
  });
});

describe("Property type CRU", () => {
  const propertyType = ($id: string): PropertyTypeSchema => {
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

  const createdPropertyType$id =
    "https://property-type~example.com/property-type/v/1";
  let createdPropertyType: PropertyType;
  it("can create a property type", async () => {
    createdPropertyType = await PropertyType.create(graphApi, {
      ...accountId,
      schema: propertyType(createdPropertyType$id),
    });
  });

  it("can read a property type", async () => {
    const fetchedPropertyType = await PropertyType.get(graphApi, {
      ...accountId,
      versionedUri: createdPropertyType$id,
    });

    expect(fetchedPropertyType.schema.$id).toEqual(createdPropertyType$id);
  });

  const updated$id = "https://property-type~example.com/property-type/v/2";
  const updatedTitle = "New test!";
  it("can update a property type", async () => {
    await createdPropertyType
      .update(graphApi, {
        ...accountId,
        schema: {
          ...propertyType(updated$id),
          title: updatedTitle,
        },
      })
      .catch((err) => Promise.reject(err.data));
  });

  it("can read all latest property types", async () => {
    const allPropertyTypes = await PropertyType.getAllLatest(
      graphApi,
      accountId,
    );

    const newlyUpdated = allPropertyTypes.find(
      (pt) => pt.schema.$id === updated$id,
    );

    expect(allPropertyTypes.length).toBeGreaterThan(0);
    expect(newlyUpdated).toBeDefined();

    expect(newlyUpdated!.schema.$id).toEqual(updated$id);
    expect(newlyUpdated!.schema.title).toEqual(updatedTitle);
  });
});
