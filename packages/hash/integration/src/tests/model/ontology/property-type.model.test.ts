import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import { PropertyType } from "@blockprotocol/type-system-web";
import {
  DataTypeModel,
  PropertyTypeModel,
  UserModel,
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

let testUser: UserModel;
let testUser2: UserModel;
let textDataTypeModel: DataTypeModel;
let propertyTypeSchema: Omit<PropertyType, "$id">;

beforeAll(async () => {
  testUser = await createTestUser(graphApi, "pt-test-1", logger);
  testUser2 = await createTestUser(graphApi, "pt-test-2", logger);

  textDataTypeModel = await DataTypeModel.create(graphApi, {
    ownedById: testUser.entityUuid,
    schema: {
      kind: "dataType",
      title: "Text",
      type: "string",
    },
    actorId: testUser.entityUuid,
  });

  propertyTypeSchema = {
    kind: "propertyType",
    title: "A property type",
    oneOf: [
      {
        $ref: textDataTypeModel.schema.$id,
      },
    ],
  };
});

describe("Property type CRU", () => {
  let createdPropertyTypeModel: PropertyTypeModel;

  it("can create a property type", async () => {
    createdPropertyTypeModel = await PropertyTypeModel.create(graphApi, {
      ownedById: testUser.entityUuid,
      schema: propertyTypeSchema,
      actorId: testUser.entityUuid,
    });
  });

  it("can read a property type", async () => {
    const fetchedPropertyType = await PropertyTypeModel.get(graphApi, {
      propertyTypeId: createdPropertyTypeModel.schema.$id,
    });

    expect(fetchedPropertyType.schema).toEqual(createdPropertyTypeModel.schema);
  });

  const updatedTitle = "New test!";

  it("can update a property type", async () => {
    expect(createdPropertyTypeModel.metadata.provenance.createdById).toBe(
      testUser.entityUuid,
    );
    expect(createdPropertyTypeModel.metadata.provenance.updatedById).toBe(
      testUser.entityUuid,
    );

    createdPropertyTypeModel = await createdPropertyTypeModel
      .update(graphApi, {
        schema: {
          ...propertyTypeSchema,
          title: updatedTitle,
        },
        actorId: testUser2.entityUuid,
      })
      .catch((err) => Promise.reject(err.data));

    expect(createdPropertyTypeModel.metadata.provenance.createdById).toBe(
      testUser.entityUuid,
    );
    expect(createdPropertyTypeModel.metadata.provenance.updatedById).toBe(
      testUser2.entityUuid,
    );
  });
});
