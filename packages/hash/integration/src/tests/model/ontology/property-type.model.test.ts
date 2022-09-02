import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import { PropertyType } from "@blockprotocol/type-system-web";
import {
  DataTypeModel,
  PropertyTypeModel,
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

const textDataType$id =
  "https://property-type~example.com/data-type/v/1" as const;

beforeAll(async () => {
  await DataTypeModel.create(graphApi, {
    accountId,
    schema: {
      $id: textDataType$id,
      kind: "dataType",
      title: "Text",
      type: "string",
    },
  });
});

describe("Property type CRU", () => {
  const propertyType = ($id: PropertyType["$id"]): PropertyType => {
    return {
      $id,
      kind: "propertyType",
      title: "A property type",
      pluralTitle: "Multiple property types",
      oneOf: [
        {
          $ref: textDataType$id,
        },
      ],
    };
  };

  const createdPropertyType$id =
    "https://property-type~example.com/property-type/v/1";
  let createdPropertyType: PropertyTypeModel;
  it("can create a property type", async () => {
    createdPropertyType = await PropertyTypeModel.create(graphApi, {
      accountId,
      schema: propertyType(createdPropertyType$id),
    });
  });

  it("can read a property type", async () => {
    const fetchedPropertyType = await PropertyTypeModel.get(graphApi, {
      versionedUri: createdPropertyType$id,
    });

    expect(fetchedPropertyType.schema.$id).toEqual(createdPropertyType$id);
  });

  const updated$id = "https://property-type~example.com/property-type/v/2";
  const updatedTitle = "New test!";
  it("can update a property type", async () => {
    await createdPropertyType
      .update(graphApi, {
        accountId,
        schema: {
          ...propertyType(updated$id),
          title: updatedTitle,
        },
      })
      .catch((err) => Promise.reject(err.data));
  });

  it("can read all latest property types", async () => {
    const allPropertyTypes = await PropertyTypeModel.getAllLatest(graphApi, {
      accountId,
    });

    const newlyUpdated = allPropertyTypes.find(
      (pt) => pt.schema.$id === updated$id,
    );

    expect(allPropertyTypes.length).toBeGreaterThan(0);
    expect(newlyUpdated).toBeDefined();

    expect(newlyUpdated!.schema.$id).toEqual(updated$id);
    expect(newlyUpdated!.schema.title).toEqual(updatedTitle);
  });
});
