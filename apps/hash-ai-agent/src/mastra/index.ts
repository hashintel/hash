/* eslint-disable canonical/filename-no-index */
import { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import { PinoLogger } from "@mastra/loggers";

import { claimExtractionAgent } from "./agents/claim-extraction-agent";
import { entityProposalAgent } from "./agents/entity-proposal-agent";
import { entitySummaryAgent } from "./agents/entity-summary-agent";
import { financialAgent } from "./demo/agents/financial-agent";
import { weatherAgent } from "./demo/agents/weather-agent";
import {
  completenessScorer,
  toolCallAppropriatenessScorer,
  translationScorer,
} from "./demo/scorers/weather-scorer";
import { entityRecallScorer } from "./scorers/entity-recall-scorer";
import { nerWorkflow } from "./workflows/ner-workflow";
import { weatherWorkflow } from "./workflows/weather-workflow";

export const mastra = new Mastra({
  workflows: { weatherWorkflow, nerWorkflow },
  agents: {
    weatherAgent,
    financialAgent,
    entitySummaryAgent,
    claimExtractionAgent,
    entityProposalAgent,
  },
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
