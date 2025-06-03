import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import type { Org } from "@apps/hash-api/src/graph/knowledge/system-types/org";
import {
  getOrgByShortname,
  updateOrgName,
} from "@apps/hash-api/src/graph/knowledge/system-types/org";
import { systemAccountId } from "@apps/hash-api/src/graph/system-account";
import { Logger } from "@local/hash-backend-utils/logger";
import { getWebRoles } from "@local/hash-graph-sdk/principal/web";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resetGraph } from "../../../test-server";
import { createTestImpureGraphContext, createTestOrg } from "../../../util";

const logger = new Logger({
  environment: "test",
  level: "debug",
  serviceName: "integration-tests",
});

const graphContext = createTestImpureGraphContext();

describe("Org", () => {
  beforeAll(async () => {
    await ensureSystemGraphIsInitialized({
      logger,
      context: graphContext,
      seedSystemPolicies: true,
    });
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

  it("can read the org roles", async () => {
    const authentication = { actorId: systemAccountId };

    const orgRoleMap = await getWebRoles(
      graphContext.graphApi,
      authentication,
      createdOrg.webId,
    );

    expect(Object.keys(orgRoleMap).length).toStrictEqual(2);

    const orgRoles = Object.values(orgRoleMap).map(({ webId, name }) => ({
      webId,
      name,
    }));

    expect(orgRoles).toContainEqual({
      webId: createdOrg.webId,
      name: "member",
    });
    expect(orgRoles).toContainEqual({
      webId: createdOrg.webId,
      name: "administrator",
    });
  });
});
