import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import {
  PropertyType,
  TypeSystemInitializer,
} from "@blockprotocol/type-system";
import { UserModel } from "@hashintel/hash-api/src/model";
import {
  createPropertyType,
  getPropertyType,
  updatePropertyType,
} from "@hashintel/hash-api/src/graph/ontology/primitive/property-type";
import {
  DataTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@hashintel/hash-subgraph";
import { createDataType } from "@hashintel/hash-api/src/graph/ontology/primitive/data-type";
import { createTestUser } from "../../../util";

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
let textDataType: DataTypeWithMetadata;
let propertyTypeSchema: Omit<PropertyType, "$id">;

beforeAll(async () => {
  await TypeSystemInitializer.initialize();
  testUser = await createTestUser(graphApi, "pt-test-1", logger);
  testUser2 = await createTestUser(graphApi, "pt-test-2", logger);

  textDataType = await createDataType(
    { graphApi },
    {
      ownedById: testUser.getEntityUuid(),
      schema: {
        kind: "dataType",
        title: "Text",
        type: "string",
      },
      actorId: testUser.getEntityUuid(),
    },
  );

  propertyTypeSchema = {
    kind: "propertyType",
    title: "A property type",
    oneOf: [
      {
        $ref: textDataType.schema.$id,
      },
    ],
  };
});

describe("Property type CRU", () => {
  let createdPropertyType: PropertyTypeWithMetadata;

  it("can create a property type", async () => {
    createdPropertyType = await createPropertyType(
      { graphApi },
      {
        ownedById: testUser.getEntityUuid(),
        schema: propertyTypeSchema,
        actorId: testUser.getEntityUuid(),
      },
    );
  });

  it("can read a property type", async () => {
    const fetchedPropertyType = await getPropertyType(
      { graphApi },
      {
        propertyTypeId: createdPropertyType.schema.$id,
      },
    );

    expect(fetchedPropertyType.schema).toEqual(createdPropertyType.schema);
  });

  const updatedTitle = "New test!";

  it("can update a property type", async () => {
    expect(createdPropertyType.metadata.provenance.updatedById).toBe(
      testUser.getEntityUuid(),
    );

    createdPropertyType = await updatePropertyType(
      { graphApi },
      {
        propertyTypeId: createdPropertyType.schema.$id,
        schema: {
          ...propertyTypeSchema,
          title: updatedTitle,
        },
        actorId: testUser2.getEntityUuid(),
      },
    ).catch((err) => Promise.reject(err.data));

    expect(createdPropertyType.metadata.provenance.updatedById).toBe(
      testUser2.getEntityUuid(),
    );
  });
});
