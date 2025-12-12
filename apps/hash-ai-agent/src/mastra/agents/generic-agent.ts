import { Agent } from '@mastra/core/agent';

export const genericAgent = new Agent({
  id: 'generic-agent',
  name: 'Generic Agent',
  instructions: ['You are a generic AI agent, designed to handle a variety of tasks.'],
  model: 'openrouter/google/gemini-2.5-flash-lite',
});
