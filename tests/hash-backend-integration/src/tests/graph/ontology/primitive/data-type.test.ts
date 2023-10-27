import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import {
  ensureSystemGraphIsInitialized,
  ImpureGraphContext,
} from "@apps/hash-api/src/graph";
import { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import {
  createDataType,
  getDataTypeById,
  getDataTypeSubgraphById,
  updateDataType,
} from "@apps/hash-api/src/graph/ontology/primitive/data-type";
import { systemUser } from "@apps/hash-api/src/graph/system-user";
import { publicUserAccountId } from "@apps/hash-api/src/graphql/context";
import { TypeSystemInitializer } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";
import { ConstructDataTypeParams } from "@local/hash-graphql-shared/graphql/types";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  DataTypeWithMetadata,
  isOwnedOntologyElementMetadata,
  OwnedById,
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

const dataTypeSchema: ConstructDataTypeParams = {
  title: "Text",
  type: "string",
};

beforeAll(async () => {
  await TypeSystemInitializer.initialize();
  await ensureSystemGraphIsInitialized({ logger, context: graphContext });

  testUser = await createTestUser(graphContext, "data-type-test-1", logger);
  testUser2 = await createTestUser(graphContext, "data-type-test-2", logger);
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

describe("Data type CRU", () => {
  let createdDataType: DataTypeWithMetadata;

  it("can create a data type", async () => {
    const authentication = { actorId: testUser.accountId };

    createdDataType = await createDataType(graphContext, authentication, {
      ownedById: testUser.accountId as OwnedById,
      schema: dataTypeSchema,
    });
  });

  it("can read a data type", async () => {
    const authentication = { actorId: testUser.accountId };

    const fetchedDataType = await getDataTypeById(
      graphContext,
      authentication,
      {
        dataTypeId: createdDataType.schema.$id,
      },
    );

    expect(fetchedDataType.schema).toEqual(createdDataType.schema);
  });

  const updatedTitle = "New text!";
  it.skip("can update a data type", async () => {
    expect(
      isOwnedOntologyElementMetadata(createdDataType.metadata) &&
        createdDataType.metadata.custom.provenance.recordCreatedById,
    ).toBe(testUser.accountId);

    const authentication = { actorId: testUser2.accountId };

    const updatedDataType = await updateDataType(graphContext, authentication, {
      dataTypeId: createdDataType.schema.$id,
      schema: { ...dataTypeSchema, title: updatedTitle },
    }).catch((err) => Promise.reject(err.data));

    expect(
      isOwnedOntologyElementMetadata(updatedDataType.metadata) &&
        updatedDataType.metadata.custom.provenance.recordCreatedById,
    ).toBe(testUser2.accountId);
  });

  it("can load an external type on demand", async () => {
    const authentication = { actorId: testUser.accountId };

    const dataTypeId =
      "https://blockprotocol.org/@blockprotocol/types/data-type/empty-list/v/1";

    await expect(
      getDataTypeById(
        graphContext,
        { actorId: publicUserAccountId },
        { dataTypeId },
      ),
    ).rejects.toThrow("Could not find data type with ID");

    await expect(
      getDataTypeSubgraphById(graphContext, authentication, {
        dataTypeId,
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: currentTimeInstantTemporalAxes,
      }),
    ).resolves.not.toThrow();
  });
});
