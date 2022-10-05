import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import { DataType } from "@blockprotocol/type-system";
import { DataTypeModel } from "@hashintel/hash-api/src/model";
import { createTestUser } from "../../util";

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

let ownedById: string;

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
  const testUser = await createTestUser(graphApi, "data-type-test", logger);

  ownedById = testUser.entityId;
});

describe("Data type CRU", () => {
  let createdDataTypeModel: DataTypeModel;
  let updatedDataTypeModel: DataTypeModel;

  it("can create a data type", async () => {
    createdDataTypeModel = await DataTypeModel.create(graphApi, {
      ownedById,
      schema: dataTypeSchema,
    });
  });

  it("can read a data type", async () => {
    const fetchedDataType = await DataTypeModel.get(graphApi, {
      dataTypeId: createdDataTypeModel.schema.$id,
    });

    expect(fetchedDataType.schema).toEqual(createdDataTypeModel.schema);
  });

  const updatedTitle = "New text!";
  it("can update a data type", async () => {
    updatedDataTypeModel = await createdDataTypeModel
      .update(graphApi, {
        schema: { ...dataTypeSchema, title: updatedTitle },
      })
      .catch((err) => Promise.reject(err.data));
  });

  it("can read all latest data types", async () => {
    const allDataTypes = await DataTypeModel.getAllLatest(graphApi);

    const newlyUpdated = allDataTypes.find(
      (dt) => dt.schema.$id === updatedDataTypeModel.schema.$id,
    );

    expect(allDataTypes.length).toBeGreaterThan(0);
    expect(newlyUpdated).toBeDefined();

    expect(newlyUpdated!.schema).toEqual(updatedDataTypeModel.schema);
  });
});
