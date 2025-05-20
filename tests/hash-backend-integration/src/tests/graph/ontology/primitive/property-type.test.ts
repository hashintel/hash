import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import type { Org } from "@apps/hash-api/src/graph/knowledge/system-types/org";
import type { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { joinOrg } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import {
  archivePropertyType,
  createPropertyType,
  getPropertyTypeById,
  getPropertyTypes,
  getPropertyTypeSubgraphById,
  unarchivePropertyType,
  updatePropertyType,
} from "@apps/hash-api/src/graph/ontology/primitive/property-type";
import type { PropertyTypeWithMetadata } from "@blockprotocol/type-system";
import { isOwnedOntologyElementMetadata } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import type { ConstructPropertyTypeParams } from "@local/hash-graph-sdk/ontology";
import {
  currentTimeInstantTemporalAxes,
  fullTransactionTimeAxis,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { beforeAll, describe, expect, it } from "vitest";

import { resetGraph } from "../../../test-server";
import {
  createTestImpureGraphContext,
  createTestOrg,
  createTestUser,
  textDataTypeId,
} from "../../../util";

const logger = new Logger({
  environment: "test",
  level: "debug",
  serviceName: "integration-tests",
});

const graphContext = createTestImpureGraphContext();

let testOrg: Org;
let testUser: User;
let testUser2: User;
let propertyTypeSchema: ConstructPropertyTypeParams;

beforeAll(async () => {
  await ensureSystemGraphIsInitialized({ logger, context: graphContext });

  testUser = await createTestUser(graphContext, "pt-test-1", logger);
  testUser2 = await createTestUser(graphContext, "pt-test-2", logger);

  const authentication = { actorId: testUser.accountId };

  testOrg = await createTestOrg(
    {
      ...graphContext,
      provenance: { ...graphContext.provenance, actorType: "user" },
    },
    authentication,
    "propertytestorg",
  );
  await joinOrg(graphContext, authentication, {
    userEntityId: testUser2.entity.metadata.recordId.entityId,
    orgEntityId: testOrg.entity.metadata.recordId.entityId,
  });

  propertyTypeSchema = {
    title: "A property type",
    description: "A property type for testing",
    oneOf: [
      {
        $ref: textDataTypeId,
      },
    ],
  };

  return async () => {
    await deleteKratosIdentity({
      kratosIdentityId: testUser.kratosIdentityId,
    });
    await deleteKratosIdentity({
      kratosIdentityId: testUser2.kratosIdentityId,
    });

    await resetGraph();
  };
});

describe("Property type CRU", () => {
  let createdPropertyType: PropertyTypeWithMetadata;

  it("can create a property type", async () => {
    const authentication = { actorId: testUser.accountId };

    createdPropertyType = await createPropertyType(
      graphContext,
      authentication,
      {
        webId: testOrg.webId,
        schema: propertyTypeSchema,
        relationships: [
          {
            relation: "setting",
            subject: {
              kind: "setting",
              subjectId: "updateFromWeb",
            },
          },
          {
            relation: "viewer",
            subject: {
              kind: "public",
            },
          },
        ],
      },
    );
  });

  it("can read a property type", async () => {
    const authentication = { actorId: testUser.accountId };

    const fetchedPropertyType = await getPropertyTypeById(
      graphContext,
      authentication,
      {
        propertyTypeId: createdPropertyType.schema.$id,
      },
    );

    expect(fetchedPropertyType.schema).toEqual(createdPropertyType.schema);
  });

  const updatedTitle = "New test!";

  it("can update a property type", async () => {
    expect(
      isOwnedOntologyElementMetadata(createdPropertyType.metadata) &&
        createdPropertyType.metadata.provenance.edition.createdById,
    ).toBe(testUser.accountId);

    const authentication = { actorId: testUser2.accountId };

    const updatedPropertyType = await updatePropertyType(
      graphContext,
      authentication,
      {
        propertyTypeId: createdPropertyType.schema.$id,
        schema: {
          ...propertyTypeSchema,
          title: updatedTitle,
        },
        relationships: [
          {
            relation: "setting",
            subject: {
              kind: "setting",
              subjectId: "updateFromWeb",
            },
          },
        ],
      },
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    ).catch((err) => Promise.reject(err.data));

    expect(
      isOwnedOntologyElementMetadata(updatedPropertyType.metadata) &&
        updatedPropertyType.metadata.provenance.edition.createdById,
    ).toBe(testUser2.accountId);
  });

  it("can archive a property type", async () => {
    const authentication = { actorId: testUser.accountId };

    await archivePropertyType(graphContext, authentication, {
      propertyTypeId: createdPropertyType.schema.$id,
    });

    const [archivedPropertyType] = await getPropertyTypes(
      graphContext,
      authentication,
      {
        filter: {
          equal: [
            { path: ["versionedUrl"] },
            { parameter: createdPropertyType.schema.$id },
          ],
        },
        temporalAxes: fullTransactionTimeAxis,
      },
    );

    expect(
      await getPropertyTypes(graphContext, authentication, {
        filter: {
          equal: [
            { path: ["versionedUrl"] },
            { parameter: createdPropertyType.schema.$id },
          ],
        },
        temporalAxes: currentTimeInstantTemporalAxes,
      }),
    ).toHaveLength(0);

    expect(
      archivedPropertyType?.metadata.temporalVersioning.transactionTime.end
        .kind,
    ).toBe("exclusive");

    await unarchivePropertyType(graphContext, authentication, {
      propertyTypeId: createdPropertyType.schema.$id,
    });

    const [unarchivedEntityType] = await getPropertyTypes(
      graphContext,
      authentication,
      {
        filter: {
          equal: [
            { path: ["versionedUrl"] },
            { parameter: createdPropertyType.schema.$id },
          ],
        },
        temporalAxes: fullTransactionTimeAxis,
      },
    );

    expect(
      unarchivedEntityType?.metadata.temporalVersioning.transactionTime.end
        .kind,
    ).toBe("unbounded");
  });

  it.skip("can load an external type on demand", async () => {
    const authentication = { actorId: testUser.accountId };

    const propertyTypeId =
      "https://blockprotocol.org/@blockprotocol/types/property-type/name/v/1";

    await expect(
      getPropertyTypeById(
        graphContext,
        { actorId: publicUserAccountId },
        { propertyTypeId },
      ),
    ).rejects.toThrow("Could not find property type with ID");

    await expect(
      getPropertyTypeSubgraphById(graphContext, authentication, {
        propertyTypeId,
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: currentTimeInstantTemporalAxes,
      }),
    ).resolves.not.toThrow();
  });
});
