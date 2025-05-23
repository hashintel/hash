import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import { systemAccountId } from "@apps/hash-api/src/graph/system-account";
import { Logger } from "@local/hash-backend-utils/logger";
import { getMachineByIdentifier } from "@local/hash-graph-sdk/principal/web";
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
    await ensureSystemGraphIsInitialized({ logger, context: graphContext });
  });

  afterAll(async () => {
    await resetGraph();
  });

  // TODO: Fix AI Assistant retrieval from the graph
  //   see https://linear.app/hash/issue/H-4621/fix-ai-assistant-retrieval-from-the-graph
  it.skip("can read AI assistant", async () => {
    const authentication = { actorId: systemAccountId };

    const aiAssistant = await getMachineByIdentifier(
      graphContext.graphApi,
      authentication,
      "hash-ai",
    );
    expect(aiAssistant).toBeTruthy();
  });
});
