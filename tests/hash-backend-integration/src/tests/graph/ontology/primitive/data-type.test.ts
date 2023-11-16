import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph";
import { ImpureGraphContext } from "@apps/hash-api/src/graph/context-types";
import { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import {
  createDataType,
  getDataTypeById,
  updateDataType,
} from "@apps/hash-api/src/graph/ontology/primitive/data-type";
import { TypeSystemInitializer } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";
import { ConstructDataTypeParams } from "@local/hash-isomorphic-utils/types";
import {
  DataTypeWithMetadata,
  isOwnedOntologyElementMetadata,
  OwnedById,
} from "@local/hash-subgraph";

import { resetGraph } from "../../../test-server";
import {
  createTestImpureGraphContext,
  createTestUser,
  textDataTypeId,
} from "../../../util";

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
    kratosIdentityId: testUser.kratosIdentityId,
  });
  await deleteKratosIdentity({
    kratosIdentityId: testUser2.kratosIdentityId,
  });

  await resetGraph();
});

describe("Data type CRU", () => {
  let createdDataType: DataTypeWithMetadata;

  it.skip("can create a data type", async () => {
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
        dataTypeId: textDataTypeId,
      },
    );

    expect(fetchedDataType.schema.$id).toEqual(textDataTypeId);
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
});
