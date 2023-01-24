import {
  ensureSystemGraphIsInitialized,
  ImpureGraphContext,
} from "@apps/hash-api/src/graph";
import {
  getOrgByShortname,
  Org,
  updateOrgName,
  updateOrgShortname,
} from "@apps/hash-api/src/graph/knowledge/system-types/org";
import { systemUserAccountId } from "@apps/hash-api/src/graph/system-user";
import { TypeSystemInitializer } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";

import {
  createTestImpureGraphContext,
  createTestOrg,
  generateRandomShortname,
} from "../../../util";

jest.setTimeout(60000);

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

const graphContext: ImpureGraphContext = createTestImpureGraphContext();

describe("Org", () => {
  beforeAll(async () => {
    await TypeSystemInitializer.initialize();
    await ensureSystemGraphIsInitialized({ logger, context: graphContext });
  });

  let createdOrg: Org;
  let shortname: string;
  it("can create an org", async () => {
    createdOrg = await createTestOrg(graphContext, "orgTest", logger);

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
