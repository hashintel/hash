import { Agent } from '@mastra/core/agent';
import dedent from 'dedent';

export const entityExtractionAgent = new Agent({
  id: 'entity-extraction-agent',
  name: 'Entity Extraction Agent',
  instructions: dedent(`
    You are an expert interpreter of textual semantics.
    Your task is to identify occurences of given entity types, within texts, and to collect attributes and observations about them, according to a given schema.
    You will be provided with:

    - Source Text: the source text from which you should extract entities.
    - Research Goal: the research goal, which describes the entities your team is particularly interested in.
    - Entity types: YAML definitions of entity types, including descriptions of their properties and attributes, which we want to capture if they appear.
  `),
  model: 'openrouter/google/gemini-2.5-flash-lite',
});
