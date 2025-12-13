/* eslint-disable canonical/filename-no-index */
import { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import { PinoLogger } from "@mastra/loggers";

import { claimExtractionsAgent } from "./agents/claim-extraction-agent";
import { entitySummaryAgent } from "./agents/entity-summary-agent";

export const mastra = new Mastra({
  workflows: {},
  agents: { claimExtractionAgent: claimExtractionsAgent, entitySummaryAgent },
  scorers: {},
  storage: new LibSQLStore({
    id: "mastra-memory-id",
    url: ":memory:",
  }),
  logger: new PinoLogger({
    name: "Mastra",
    level: "info",
  }),
  // telemetry: {
  //   // Telemetry is deprecated and will be removed in the Nov 4th release
  //   enabled: false,
  // },
  // observability: {
  //   // Enables DefaultExporter and CloudExporter for AI tracing
  //   default: { enabled: true },
  // },
});
