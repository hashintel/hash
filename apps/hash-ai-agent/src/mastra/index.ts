import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { weatherWorkflow } from './workflows/weather-workflow';
import { weatherAgent } from './agents/weather-agent';
import { financialAgent } from './agents/financial-agent';
import {
  toolCallAppropriatenessScorer,
  completenessScorer,
  translationScorer,
} from './scorers/weather-scorer';

export const mastra = new Mastra({
  workflows: { weatherWorkflow },
  agents: { weatherAgent, financialAgent },
  scorers: { toolCallAppropriatenessScorer, completenessScorer, translationScorer },
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
