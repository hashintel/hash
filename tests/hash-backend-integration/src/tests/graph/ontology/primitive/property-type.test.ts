import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import {
  currentTimeInstantTemporalAxes,
  ensureSystemGraphIsInitialized,
  ImpureGraphContext,
  zeroedGraphResolveDepths,
} from "@apps/hash-api/src/graph";
import { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { createDataType } from "@apps/hash-api/src/graph/ontology/primitive/data-type";
import {
  createPropertyType,
  getPropertyTypeById,
  getPropertyTypeSubgraphById,
  updatePropertyType,
} from "@apps/hash-api/src/graph/ontology/primitive/property-type";
import { systemUser } from "@apps/hash-api/src/graph/system-user";
import { TypeSystemInitializer } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";
import { ConstructPropertyTypeParams } from "@local/hash-graphql-shared/graphql/types";
import {
  DataTypeWithMetadata,
  isOwnedOntologyElementMetadata,
  OwnedById,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";

import { resetGraph } from "../../../test-server";
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
let propertyTypeSchema: ConstructPropertyTypeParams;

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
    title: "A property type",
    oneOf: [
      {
        $ref: textDataType.schema.$id,
      },
    ],
  };
});

afterAll(async () => {
  await deleteKratosIdentity({
    kratosIdentityId: systemUser.kratosIdentityId,
  });
  await deleteKratosIdentity({
    kratosIdentityId: testUser.kratosIdentityId,
  });
  await deleteKratosIdentity({
    kratosIdentityId: testUser2.kratosIdentityId,
  });

  await resetGraph();
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
    expect(
      isOwnedOntologyElementMetadata(createdPropertyType.metadata) &&
        createdPropertyType.metadata.provenance.recordCreatedById,
    ).toBe(testUser.accountId);

    const updatedPropertyType = await updatePropertyType(graphContext, {
      propertyTypeId: createdPropertyType.schema.$id,
      schema: {
        ...propertyTypeSchema,
        title: updatedTitle,
      },
      actorId: testUser2.accountId,
    }).catch((err) => Promise.reject(err.data));

    expect(
      isOwnedOntologyElementMetadata(updatedPropertyType.metadata) &&
        updatedPropertyType.metadata.provenance.recordCreatedById,
    ).toBe(testUser2.accountId);
  });

  it("can load an external type on demand", async () => {
    const propertyTypeId =
      "https://blockprotocol.org/@blockprotocol/types/property-type/name/v/1";

    await expect(
      getPropertyTypeById(graphContext, { propertyTypeId }),
    ).rejects.toThrow("Could not find property type with ID");

    await expect(
      getPropertyTypeSubgraphById(graphContext, {
        propertyTypeId,
        actorId: testUser.accountId,
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: currentTimeInstantTemporalAxes,
      }),
    ).resolves.not.toThrow();
  });
});
