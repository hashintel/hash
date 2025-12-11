/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable canonical/filename-no-index */
import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { PinoLogger } from '@mastra/loggers';

import { entityExtractionAgent } from './agents/entity-extraction-agent';
import { claimExtractionsAgent } from './agents/prev/claim-extraction-agent';
import { entitySummaryAgent } from './agents/prev/entity-summary-agent';
import { extractPeopleWorkflow, nerWorkflow } from './workflows/ner-workflow';

export const mastra = new Mastra({
  workflows: { nerWorkflow, extractPeopleWorkflow },
  agents: {
    // agents go here
    // claimExtractionsAgent,
    // entitySummaryAgent,
    entityExtractionAgent,
  },
  scorers: {},
  storage: new LibSQLStore({
    id: 'mastra-memory-id',
    url: ':memory:',
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
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
