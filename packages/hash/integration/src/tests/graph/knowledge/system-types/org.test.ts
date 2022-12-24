import { TypeSystemInitializer } from "@blockprotocol/type-system";
import {
  createGraphClient,
  ensureSystemGraphIsInitialized,
  ImpureGraphContext,
} from "@hashintel/hash-api/src/graph";
import {
  getOrgByShortname,
  Org,
  updateOrgName,
  updateOrgShortname,
} from "@hashintel/hash-api/src/graph/knowledge/system-types/org";
import { systemUserAccountId } from "@hashintel/hash-api/src/graph/system-user";
import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import { createTestOrg, generateRandomShortname } from "../../../util";

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

const graphContext: ImpureGraphContext = { graphApi };

describe("Org", () => {
  beforeAll(async () => {
    await TypeSystemInitializer.initialize();
    await ensureSystemGraphIsInitialized({ graphApi, logger });
  });

  let createdOrg: Org;
  let shortname: string;
  it("can create an org", async () => {
    createdOrg = await createTestOrg(graphApi, "orgTest", logger);

    shortname = createdOrg.shortname;
  });

  it("can get the account id", () => {
    expect(createdOrg.entity.metadata.editionId.baseId).toBeDefined();
  });

  it("can update the shortname of an org", async () => {
    shortname = generateRandomShortname("orgTest");

    createdOrg = await updateOrgShortname(graphContext, {
      org: createdOrg,
      updatedShortname: shortname,
      actorId: systemUserAccountId,
    });
  });

  it("can update the preferred name of an org", async () => {
    createdOrg = await updateOrgName(graphContext, {
      org: createdOrg,
      updatedOrgName: "The testing org",
      actorId: systemUserAccountId,
    });
  });

  it("can get an org by its shortname", async () => {
    const fetchedOrg = await getOrgByShortname(graphContext, {
      shortname,
    });

    expect(fetchedOrg).toEqual(createdOrg);
  });
});
