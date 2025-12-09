/* eslint-disable canonical/filename-no-index */
import { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import { PinoLogger } from "@mastra/loggers";

import { claimExtractionAgent } from "./agents/ner-claim-extraction";
import { entityProposalAgent } from "./agents/ner-entity-proposal";
import { entitySummaryAgent } from "./agents/ner-entity-summary";
import { financialAgent } from "./demo/agents/financial-agent";
import { weatherAgent } from "./demo/agents/weather-agent";
import {
  completenessScorer,
  toolCallAppropriatenessScorer,
  translationScorer,
} from "./demo/scorers/weather-scorer";
import { weatherWorkflow } from "./demo/workflows/weather-workflow";
import { entityRecallScorer } from "./scorers/entity-recall-scorer";
import { nerWorkflow } from "./workflows/ner-workflow";

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
