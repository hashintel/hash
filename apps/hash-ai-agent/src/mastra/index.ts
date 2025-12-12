/* eslint-disable canonical/filename-no-index */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { PinoLogger } from '@mastra/loggers';
import { Observability } from '@mastra/observability';

import { entityExtractionAgent } from './agents/entity-extraction-agent';
import { genericAgent } from './agents/generic-agent';
import { nerAgent } from './agents/ner-agent';
import { relevancyScorer } from './scorers/demo-relevancy-scorer';
import { extractPeopleWorkflow, nerWorkflow } from './workflows/ner-workflow';

const metaFilename = fileURLToPath(import.meta.url);
const metaDirname = path.dirname(metaFilename);

/* NOTE: full path to storage DB, from compiled entrypoint */
const dbFilePath = path.resolve(metaDirname, '../../data/mastra.db');
const dbUrl = pathToFileURL(dbFilePath).toString();

export const mastra = new Mastra({
  workflows: { nerWorkflow, extractPeopleWorkflow },
  agents: {
    // agents
    entityExtractionAgent,
    nerAgent,
    genericAgent,
  },
  scorers: {
    // scorers
    relevancyScorer,
  },
  logger: new PinoLogger(),
  storage: new LibSQLStore({ id: 'mastra-storage', url: dbUrl }),
  observability: new Observability({
    default: { enabled: true },
  }),
});
