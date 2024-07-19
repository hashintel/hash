import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import type { Org } from "@apps/hash-api/src/graph/knowledge/system-types/org";
import {
  getOrgByShortname,
  updateOrgName,
} from "@apps/hash-api/src/graph/knowledge/system-types/org";
import { systemAccountId } from "@apps/hash-api/src/graph/system-account";
import { Logger } from "@local/hash-backend-utils/logger";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resetGraph } from "../../../test-server";
import { createTestImpureGraphContext, createTestOrg } from "../../../util";

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

const graphContext = createTestImpureGraphContext();

describe("Org", () => {
  beforeAll(async () => {
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
    );

    shortname = createdOrg.shortname;
  });

  it("can get the account id", () => {
    expect(createdOrg.entity.metadata.recordId.entityId).toBeDefined();
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
