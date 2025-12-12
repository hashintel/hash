import { Agent } from '@mastra/core/agent';

export const nerAgent = new Agent({
  id: 'ner-agent',
  name: 'Named Entity Recognition Agent',
  instructions: [
    'You are an expert interpreter of textual semantics.',
    'You specialize in identifying and classifying named entities within texts.',
  ],
  model: 'openrouter/google/gemini-2.5-flash-lite',
});
