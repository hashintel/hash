import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import { DataType } from "@hashintel/hash-graph-client/";
import { DataTypeModel } from "@hashintel/hash-api/src/model";

jest.setTimeout(60000);

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

const graphApi = createGraphClient(
  { basePath: getRequiredEnv("HASH_GRAPH_API_BASE_URL") },
  logger,
);

const accountId = { accountId: "00000000-0000-0000-0000-000000000000" };

const textDataType$id = "https://data-type~example.com/data-type/v/1";

describe("Data type CRU", () => {
  const dataType = ($id: string): DataType => {
    return {
      $id,
      kind: "dataType",
      title: "Text",
      type: "string",
    };
  };

  const createdDataType$id = textDataType$id;
  let createdDataType: DataTypeModel;
  it("can create a data type", async () => {
    createdDataType = await DataTypeModel.create(graphApi, {
      ...accountId,
      schema: dataType(createdDataType$id),
    });
  });

  it("can read a data type", async () => {
    const fetchedDataType = await DataTypeModel.get(graphApi, {
      ...accountId,
      versionedUri: createdDataType$id,
    });

    expect(fetchedDataType.schema.$id).toEqual(createdDataType$id);
  });

  const updated$id = "https://data-type~example.com/data-type/v/2";
  const updatedTitle = "New text!";
  it("can update a data type", async () => {
    await createdDataType
      .update(graphApi, {
        ...accountId,
        schema: { ...dataType(updated$id), title: updatedTitle },
      })
      .catch((err) => Promise.reject(err.data));
  });

  it("can read all latest data types", async () => {
    const allDataTypes = await DataTypeModel.getAllLatest(graphApi, accountId);

    const newlyUpdated = allDataTypes.find(
      (dt) => dt.schema.$id === updated$id,
    );

    expect(allDataTypes.length).toBeGreaterThan(0);
    expect(newlyUpdated).toBeDefined();

    expect(newlyUpdated!.schema.$id).toEqual(updated$id);
    expect(newlyUpdated!.schema.title).toEqual(updatedTitle);
  });
});
