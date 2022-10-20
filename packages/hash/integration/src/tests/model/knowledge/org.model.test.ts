import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { ensureWorkspaceTypesExist } from "@hashintel/hash-api/src/graph/workspace-types";
import { OrgModel, OrgSize } from "@hashintel/hash-api/src/model";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { workspaceAccountId } from "@hashintel/hash-api/src/model/util";
import { generateRandomShortname } from "../../util";

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
  let shortname = "test-org";
  it("can create an org", async () => {
    createdOrg = await OrgModel.createOrg(graphApi, {
      name: "Test org",
      shortname,
      providedInfo: {
        orgSize: OrgSize.ElevenToFifty,
      },
      actorId: workspaceAccountId,
    });
  });

  it("can get the account id", () => {
    expect(createdOrg.entityId).toBeDefined();
  });

  it("can update the shortname of an org", async () => {
    shortname = generateRandomShortname("orgTest");
    createdOrg = await createdOrg.updateShortname(graphApi, {
      updatedShortname: shortname,
      actorId: workspaceAccountId,
    });
  });

  it("can update the preferred name of an org", async () => {
    createdOrg = await createdOrg.updateOrgName(graphApi, {
      updatedOrgName: "The testing org",
      actorId: workspaceAccountId,
    });
  });

  it("can get an org by its shortname", async () => {
    const fetchedOrg = await OrgModel.getOrgByShortname(graphApi, {
      shortname,
    });

    expect(fetchedOrg).toEqual(createdOrg);
  });
});
