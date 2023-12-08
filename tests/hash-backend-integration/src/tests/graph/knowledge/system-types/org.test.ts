import { ImpureGraphContext } from "@apps/hash-api/src/graph/context-types";
import { systemAccountId } from "@apps/hash-api/src/graph/ensure-hash-system-account-exists";
import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import {
  getOrgByShortname,
  Org,
  updateOrgName,
  updateOrgShortname,
} from "@apps/hash-api/src/graph/knowledge/system-types/org";
import { TypeSystemInitializer } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";

import { resetGraph } from "../../../test-server";
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

  afterAll(async () => {
    await resetGraph();
  });

  let createdOrg: Org;
  let shortname: string;
  it("can create an org", async () => {
    createdOrg = await createTestOrg(
      graphContext,
      { actorId: systemAccountId },
      "orgTest",
      logger,
    );

    shortname = createdOrg.shortname;
  });

  it("can get the account id", () => {
    expect(createdOrg.entity.metadata.recordId.entityId).toBeDefined();
  });

  it("can update the shortname of an org", async () => {
    const authentication = { actorId: systemAccountId };
    shortname = generateRandomShortname("orgTest");

    createdOrg = await updateOrgShortname(graphContext, authentication, {
      org: createdOrg,
      updatedShortname: shortname,
    });
  });

  it("can update the preferred name of an org", async () => {
    const authentication = { actorId: systemAccountId };

    createdOrg = await updateOrgName(graphContext, authentication, {
      org: createdOrg,
      updatedOrgName: "The testing org",
    });
  });

  it("can get an org by its shortname", async () => {
    const authentication = { actorId: systemAccountId };

    const fetchedOrg = await getOrgByShortname(graphContext, authentication, {
      shortname,
    });

    expect(fetchedOrg).toEqual(createdOrg);
  });
});
