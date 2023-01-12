import {
  PropertyType,
  TypeSystemInitializer,
} from "@blockprotocol/type-system";
import {
  ensureSystemGraphIsInitialized,
  ImpureGraphContext,
} from "@hashintel/hash-api/src/graph";
import { User } from "@hashintel/hash-api/src/graph/knowledge/system-types/user";
import { createDataType } from "@hashintel/hash-api/src/graph/ontology/primitive/data-type";
import {
  createPropertyType,
  getPropertyTypeById,
  updatePropertyType,
} from "@hashintel/hash-api/src/graph/ontology/primitive/property-type";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { OwnedById } from "@hashintel/hash-shared/types";
import {
  DataTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@hashintel/hash-subgraph";

import { createTestImpureGraphContext, createTestUser } from "../../../util";

jest.setTimeout(60000);

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

const graphContext: ImpureGraphContext = createTestImpureGraphContext();

let testUser: User;
let testUser2: User;
let textDataType: DataTypeWithMetadata;
let propertyTypeSchema: Omit<PropertyType, "$id">;

beforeAll(async () => {
  await TypeSystemInitializer.initialize();
  await ensureSystemGraphIsInitialized({ logger, context: graphContext });

  testUser = await createTestUser(graphContext, "pt-test-1", logger);
  testUser2 = await createTestUser(graphContext, "pt-test-2", logger);

  textDataType = await createDataType(graphContext, {
    ownedById: testUser.accountId as OwnedById,
    schema: {
      kind: "dataType",
      title: "Text",
      type: "string",
    },
    actorId: testUser.accountId,
  });

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
    createdPropertyType = await createPropertyType(graphContext, {
      ownedById: testUser.accountId as OwnedById,
      schema: propertyTypeSchema,
      actorId: testUser.accountId,
    });
  });

  it("can read a property type", async () => {
    const fetchedPropertyType = await getPropertyTypeById(graphContext, {
      propertyTypeId: createdPropertyType.schema.$id,
    });

    expect(fetchedPropertyType.schema).toEqual(createdPropertyType.schema);
  });

  const updatedTitle = "New test!";

  it("can update a property type", async () => {
    expect(createdPropertyType.metadata.provenance.updatedById).toBe(
      testUser.accountId,
    );

    createdPropertyType = await updatePropertyType(graphContext, {
      propertyTypeId: createdPropertyType.schema.$id,
      schema: {
        ...propertyTypeSchema,
        title: updatedTitle,
      },
      actorId: testUser2.accountId,
    }).catch((err) => Promise.reject(err.data));

    expect(createdPropertyType.metadata.provenance.updatedById).toBe(
      testUser2.accountId,
    );
  });
});
