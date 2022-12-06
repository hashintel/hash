import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { OrgModel } from "@hashintel/hash-api/src/model";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { TypeSystemInitializer } from "@blockprotocol/type-system";
import { systemOrgAccountId } from "@hashintel/hash-api/src/graph/system-org";
import {
  createTestOrg,
  ensureHashAppIsInitialized,
  generateRandomShortname,
} from "../../util";

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
    await TypeSystemInitializer.initialize();
    await ensureHashAppIsInitialized({ graphApi, logger });
  });

  let createdOrg: OrgModel;
  let shortname: string;
  it("can create an org", async () => {
    createdOrg = await createTestOrg(graphApi, "orgModelTest", logger);

    shortname = createdOrg.getShortname();
  });

  it("can get the account id", () => {
    expect(createdOrg.getEntityUuid()).toBeDefined();
  });

  it("can update the shortname of an org", async () => {
    shortname = generateRandomShortname("orgTest");

    createdOrg = await createdOrg.updateShortname(graphApi, {
      updatedShortname: shortname,
      actorId: systemOrgAccountId,
    });
  });

  it("can update the preferred name of an org", async () => {
    createdOrg = await createdOrg.updateOrgName(graphApi, {
      updatedOrgName: "The testing org",
      actorId: systemOrgAccountId,
    });
  });

  it("can get an org by its shortname", async () => {
    const fetchedOrg = await OrgModel.getOrgByShortname(graphApi, {
      shortname,
    });

    expect(fetchedOrg).toEqual(createdOrg);
  });
});
