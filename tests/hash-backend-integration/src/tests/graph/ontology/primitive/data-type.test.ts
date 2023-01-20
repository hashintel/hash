import {
  ensureSystemGraphIsInitialized,
  ImpureGraphContext,
} from "@apps/hash-api/src/graph";
import { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import {
  createDataType,
  getDataTypeById,
  updateDataType,
} from "@apps/hash-api/src/graph/ontology/primitive/data-type";
import { DataType, TypeSystemInitializer } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";
import { OwnedById } from "@local/hash-isomorphic-utils/types";
import { DataTypeWithMetadata } from "../hash-subgraph/src";

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

// we have to manually specify this type because of 'intended' limitations of `Omit` with extended Record types:
//  https://github.com/microsoft/TypeScript/issues/50638
//  this is needed for as long as DataType extends Record
const dataTypeSchema: Pick<
  DataType,
  "kind" | "title" | "description" | "type"
> &
  Record<string, any> = {
  kind: "dataType",
  title: "Text",
  type: "string",
};

beforeAll(async () => {
  await TypeSystemInitializer.initialize();
  await ensureSystemGraphIsInitialized({ logger, context: graphContext });

  testUser = await createTestUser(graphContext, "data-type-test-1", logger);
  testUser2 = await createTestUser(graphContext, "data-type-test-2", logger);
});

describe("Data type CRU", () => {
  let createdDataType: DataTypeWithMetadata;

  it("can create a data type", async () => {
    createdDataType = await createDataType(graphContext, {
      ownedById: testUser.accountId as OwnedById,
      schema: dataTypeSchema,
      actorId: testUser.accountId,
    });
  });

  it("can read a data type", async () => {
    const fetchedDataType = await getDataTypeById(graphContext, {
      dataTypeId: createdDataType.schema.$id,
    });

    expect(fetchedDataType.schema).toEqual(createdDataType.schema);
  });

  const updatedTitle = "New text!";
  it("can update a data type", async () => {
    expect(createdDataType.metadata.provenance.updatedById).toBe(
      testUser.accountId,
    );

    createdDataType = await updateDataType(graphContext, {
      dataTypeId: createdDataType.schema.$id,
      schema: { ...dataTypeSchema, title: updatedTitle },
      actorId: testUser2.accountId,
    }).catch((err) => Promise.reject(err.data));

    expect(createdDataType.metadata.provenance.updatedById).toBe(
      testUser2.accountId,
    );
  });
});
