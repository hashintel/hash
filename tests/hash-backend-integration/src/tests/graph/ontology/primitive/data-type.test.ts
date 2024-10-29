import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import type { Org } from "@apps/hash-api/src/graph/knowledge/system-types/org";
import type { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { joinOrg } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import {
  createDataType,
  getDataTypeById,
  updateDataType,
} from "@apps/hash-api/src/graph/ontology/primitive/data-type";
import { modifyWebAuthorizationRelationships } from "@apps/hash-api/src/graph/ontology/primitive/util";
import { Logger } from "@local/hash-backend-utils/logger";
import type {
  ConstructDataTypeParams,
  DataTypeWithMetadata,
} from "@local/hash-graph-types/ontology";
import type { OwnedById } from "@local/hash-graph-types/web";
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
  environment: "test",
  level: "debug",
  serviceName: "integration-tests",
});

const graphContext = createTestImpureGraphContext();

let testOrg: Org;
let testUser: User;
let testUser2: User;

const dataTypeSchema: ConstructDataTypeParams = {
  title: "Text",
  description: "A string of text.",
  type: "string",
  allOf: [
    {
      $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
    },
  ],
};

beforeAll(async () => {
  await ensureSystemGraphIsInitialized({ logger, context: graphContext });

  testUser = await createTestUser(graphContext, "data-type-test-1", logger);
  testUser2 = await createTestUser(graphContext, "data-type-test-2", logger);

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

  // Currently, full access permissions are required to update a data type
  await modifyWebAuthorizationRelationships(graphContext, authentication, [
    {
      relationship: {
        resource: {
          kind: "web",
          resourceId: testOrg.accountGroupId as OwnedById,
        },
        relation: "owner",
        subject: {
          kind: "account",
          subjectId: testUser2.accountId,
        },
      },
      operation: "create",
    },
  ]);

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

describe("Data type CRU", () => {
  let createdDataType: DataTypeWithMetadata;

  it("can create a data type", async () => {
    const authentication = { actorId: testUser.accountId };

    createdDataType = await createDataType(graphContext, authentication, {
      ownedById: testOrg.accountGroupId as OwnedById,
      schema: dataTypeSchema,
      relationships: [{ relation: "viewer", subject: { kind: "public" } }],
      conversions: {},
    });
  });

  it("can read a data type", async () => {
    const authentication = { actorId: testUser.accountId };

    const fetchedDataType = await getDataTypeById(
      graphContext,
      authentication,
      {
        dataTypeId: textDataTypeId,
      },
    );

    expect(fetchedDataType.schema.$id).toEqual(textDataTypeId);
  });

  const updatedTitle = "New text!";
  it("can update a data type", async () => {
    expect(
      isOwnedOntologyElementMetadata(createdDataType.metadata) &&
        createdDataType.metadata.provenance.edition.createdById,
    ).toBe(testUser.accountId);

    const authentication = { actorId: testUser2.accountId };

    const updatedDataType = await updateDataType(graphContext, authentication, {
      dataTypeId: createdDataType.schema.$id,
      schema: { ...dataTypeSchema, title: updatedTitle },
      relationships: [{ relation: "viewer", subject: { kind: "public" } }],
      conversions: {},
    }).catch((err) => Promise.reject(err.data));

    expect(
      isOwnedOntologyElementMetadata(updatedDataType.metadata) &&
        updatedDataType.metadata.provenance.edition.createdById,
    ).toBe(testUser2.accountId);
  });
});
