/* eslint-disable canonical/filename-no-index */
import { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import { PinoLogger } from "@mastra/loggers";

import { entitySummaryAgent } from "./agents/entity-summary-agent";
import { financialAgent } from "./demo/agents/financial-agent";
import { weatherAgent } from "./demo/agents/weather-agent";
import {
  completenessScorer,
  toolCallAppropriatenessScorer,
  translationScorer,
} from "./demo/scorers/weather-scorer";
import { entityRecallScorer } from "./scorers/entity-recall-scorer";
import { weatherWorkflow } from "./workflows/weather-workflow";

export const mastra = new Mastra({
  workflows: { weatherWorkflow },
  agents: { weatherAgent, financialAgent, entitySummaryAgent },
  scorers: {
    toolCallAppropriatenessScorer,
    completenessScorer,
    translationScorer,
    entityRecallScorer,
  },
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
