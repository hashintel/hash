import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import type { Org } from "@apps/hash-api/src/graph/knowledge/system-types/org";
import type { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { joinOrg } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import {
  createPropertyType,
  getPropertyTypeById,
  getPropertyTypeSubgraphById,
  updatePropertyType,
} from "@apps/hash-api/src/graph/ontology/primitive/property-type";
import { Logger } from "@local/hash-backend-utils/logger";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import type { PropertyTypeWithMetadata } from "@local/hash-graph-types/ontology";
import type { OwnedById } from "@local/hash-graph-types/web";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import type { ConstructPropertyTypeParams } from "@local/hash-isomorphic-utils/types";
import { isOwnedOntologyElementMetadata } from "@local/hash-subgraph";
import { beforeAll, describe, expect, it } from "vitest";

import { resetGraph } from "../../../test-server";
import {
  createTestImpureGraphContext,
  createTestOrg,
  createTestUser,
  textDataTypeId,
} from "../../../util";

const logger = new Logger({
  mode: "dev",
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
    graphContext,
    authentication,
    "propertytestorg",
  );
  await joinOrg(graphContext, authentication, {
    userEntityId: testUser2.entity.metadata.recordId.entityId,
    orgEntityId: testOrg.entity.metadata.recordId.entityId,
  });

  propertyTypeSchema = {
    title: "A property type",
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
        ownedById: testOrg.accountGroupId as OwnedById,
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
    ).catch((err) => Promise.reject(err.data));

    expect(
      isOwnedOntologyElementMetadata(updatedPropertyType.metadata) &&
        updatedPropertyType.metadata.provenance.edition.createdById,
    ).toBe(testUser2.accountId);
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
