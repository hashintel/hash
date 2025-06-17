import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import { systemAccountId } from "@apps/hash-api/src/graph/system-account";
import { Logger } from "@local/hash-backend-utils/logger";
import { getAiByIdentifier } from "@local/hash-graph-sdk/principal/actor";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resetGraph } from "../../../test-server";
import { createTestImpureGraphContext } from "../../../util";

const logger = new Logger({
  environment: "test",
  level: "debug",
  serviceName: "integration-tests",
});

const graphContext = createTestImpureGraphContext();

describe("AI Assistant", () => {
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

  it("can read AI assistant", async () => {
    const authentication = { actorId: systemAccountId };

    const aiAssistant = await getAiByIdentifier(
      graphContext.graphApi,
      authentication,
      "hash-ai",
    );
    expect(aiAssistant).toBeTruthy();
  });
});
