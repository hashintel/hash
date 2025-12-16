import { Agent } from '@mastra/core/agent';

import { DEFAULT_MODEL } from '../constants';

export const genericAgent = new Agent({
  id: 'generic-agent',
  name: 'Generic Agent',
  instructions: ['You are a generic AI agent, designed to handle a variety of tasks.'],
  model: DEFAULT_MODEL,
});
