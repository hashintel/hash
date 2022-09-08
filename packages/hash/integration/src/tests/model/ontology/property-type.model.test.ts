import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import { PropertyType } from "@blockprotocol/type-system-web";
import {
  DataTypeModel,
  PropertyTypeModel,
} from "@hashintel/hash-api/src/model";
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
let textDataTypeModel: DataTypeModel;
let propertyTypeSchema: Omit<PropertyType, "$id">;

beforeAll(async () => {
  accountId = await createTestUser(graphApi, "property-type-test", logger);

  textDataTypeModel = await DataTypeModel.create(graphApi, {
    accountId,
    schema: {
      kind: "dataType",
      title: "Text",
      type: "string",
    },
  });

  propertyTypeSchema = {
    kind: "propertyType",
    title: "A property type",
    pluralTitle: "Multiple property types",
    oneOf: [
      {
        $ref: textDataTypeModel.schema.$id,
      },
    ],
  };
});

describe("Property type CRU", () => {
  let createdPropertyTypeModel: PropertyTypeModel;
  let updatedPropertyTypeModel: PropertyTypeModel;

  it("can create a property type", async () => {
    createdPropertyTypeModel = await PropertyTypeModel.create(graphApi, {
      accountId,
      schema: propertyTypeSchema,
    });
  });

  it("can read a property type", async () => {
    const fetchedPropertyType = await PropertyTypeModel.get(graphApi, {
      versionedUri: createdPropertyTypeModel.schema.$id,
    });

    expect(fetchedPropertyType.schema).toEqual(createdPropertyTypeModel.schema);
  });

  const updatedTitle = "New test!";

  it("can update a property type", async () => {
    updatedPropertyTypeModel = await createdPropertyTypeModel
      .update(graphApi, {
        accountId,
        schema: {
          ...propertyTypeSchema,
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
      (pt) => pt.schema.$id === updatedPropertyTypeModel.schema.$id,
    );

    expect(allPropertyTypes.length).toBeGreaterThan(0);
    expect(newlyUpdated).toBeDefined();

    expect(newlyUpdated!.schema).toEqual(updatedPropertyTypeModel.schema);
    expect(newlyUpdated!.schema.title).toEqual(updatedTitle);
  });
});
