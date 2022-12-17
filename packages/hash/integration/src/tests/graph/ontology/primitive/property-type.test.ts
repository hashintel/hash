import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import {
  createGraphClient,
  ensureSystemGraphIsInitialized,
} from "@hashintel/hash-api/src/graph";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import {
  PropertyType,
  TypeSystemInitializer,
} from "@blockprotocol/type-system";
import {
  createPropertyType,
  getPropertyTypeById,
  updatePropertyType,
} from "@hashintel/hash-api/src/graph/ontology/primitive/property-type";
import {
  DataTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@hashintel/hash-subgraph";
import { createDataType } from "@hashintel/hash-api/src/graph/ontology/primitive/data-type";
import { User } from "@hashintel/hash-api/src/graph/knowledge/system-types/user";
import { OwnedById } from "@hashintel/hash-shared/types";
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

let testUser: User;
let testUser2: User;
let textDataType: DataTypeWithMetadata;
let propertyTypeSchema: Omit<PropertyType, "$id">;

beforeAll(async () => {
  await TypeSystemInitializer.initialize();
  await ensureSystemGraphIsInitialized({ graphApi, logger });

  testUser = await createTestUser(graphApi, "pt-test-1", logger);
  testUser2 = await createTestUser(graphApi, "pt-test-2", logger);

  textDataType = await createDataType(
    { graphApi },
    {
      ownedById: testUser.accountId as OwnedById,
      schema: {
        kind: "dataType",
        title: "Text",
        type: "string",
      },
      actorId: testUser.accountId,
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
        ownedById: testUser.accountId as OwnedById,
        schema: propertyTypeSchema,
        actorId: testUser.accountId,
      },
    );
  });

  it("can read a property type", async () => {
    const fetchedPropertyType = await getPropertyTypeById(
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
      testUser.accountId,
    );

    createdPropertyType = await updatePropertyType(
      { graphApi },
      {
        propertyTypeId: createdPropertyType.schema.$id,
        schema: {
          ...propertyTypeSchema,
          title: updatedTitle,
        },
        actorId: testUser2.accountId,
      },
    ).catch((err) => Promise.reject(err.data));

    expect(createdPropertyType.metadata.provenance.updatedById).toBe(
      testUser2.accountId,
    );
  });
});
