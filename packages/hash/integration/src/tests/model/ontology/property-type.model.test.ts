import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import {
  PropertyType,
  TypeSystemInitializer,
} from "@blockprotocol/type-system";
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
  await TypeSystemInitializer.initialize();
  testUser = await createTestUser(graphApi, "pt-test-1", logger);
  testUser2 = await createTestUser(graphApi, "pt-test-2", logger);

  textDataTypeModel = await DataTypeModel.create(graphApi, {
    ownedById: testUser.getEntityUuid(),
    schema: {
      kind: "dataType",
      title: "Text",
      type: "string",
    },
    actorId: testUser.getEntityUuid(),
  });

  propertyTypeSchema = {
    kind: "propertyType",
    title: "A property type",
    oneOf: [
      {
        $ref: textDataTypeModel.getSchema().$id,
      },
    ],
  };
});

describe("Property type CRU", () => {
  let createdPropertyTypeModel: PropertyTypeModel;

  it("can create a property type", async () => {
    createdPropertyTypeModel = await PropertyTypeModel.create(graphApi, {
      ownedById: testUser.getEntityUuid(),
      schema: propertyTypeSchema,
      actorId: testUser.getEntityUuid(),
    });
  });

  it("can read a property type", async () => {
    const fetchedPropertyType = await PropertyTypeModel.get(graphApi, {
      propertyTypeId: createdPropertyTypeModel.getSchema().$id,
    });

    expect(fetchedPropertyType.getSchema()).toEqual(
      createdPropertyTypeModel.getSchema(),
    );
  });

  const updatedTitle = "New test!";

  it("can update a property type", async () => {
    expect(createdPropertyTypeModel.getMetadata().provenance.updatedById).toBe(
      testUser.getEntityUuid(),
    );

    createdPropertyTypeModel = await createdPropertyTypeModel
      .update(graphApi, {
        schema: {
          ...propertyTypeSchema,
          title: updatedTitle,
        },
        actorId: testUser2.getEntityUuid(),
      })
      .catch((err) => Promise.reject(err.data));

    expect(createdPropertyTypeModel.getMetadata().provenance.updatedById).toBe(
      testUser2.getEntityUuid(),
    );
  });
});
