import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { ensureWorkspaceTypesExist } from "@hashintel/hash-api/src/graph/workspace-types";
import { OrgModel, OrgSize } from "@hashintel/hash-api/src/model";
import { Logger } from "@hashintel/hash-backend-utils/logger";

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

describe("Org model class", () => {
  beforeAll(async () => {
    await ensureWorkspaceTypesExist({ graphApi, logger });
  });

  let createdOrg: OrgModel;
  it("can create an org", async () => {
    createdOrg = await OrgModel.createOrg(graphApi, {
      name: "Test org",
      shortname: "test-org",
      providedInfo: {
        orgSize: OrgSize.ElevenToFifty,
      },
    });
  });
});
