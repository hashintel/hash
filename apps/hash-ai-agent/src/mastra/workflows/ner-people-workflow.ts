import { createStep, createWorkflow } from '@mastra/core/workflows';
import dedent from 'dedent';
import { z } from 'zod';

import { nerAgent } from '../agents/ner-agent';
import { dereferencedPersonSchema } from '../fixtures/entity-schemas/person';
import { entityTypesToYaml } from '../utils/entity-type-to-yaml';

const nerPeopleInputSchema = z.object({
  sourceText: z.string(),
  researchGoal: z.string(),
});

const nerPeopleOutputSchema = z.array(
  z.object({
    name: z.string().optional().describe('Full name of the person'),
    university: z.string().optional().describe('The university the person is affiliated with'),
    location: z.string().optional().describe('The primary location of the person'),
  })
);

export const nerPeopleStep = createStep({
  id: 'ner-people-step',
  inputSchema: nerPeopleInputSchema,
  outputSchema: nerPeopleOutputSchema,
  execute: async ({ inputData: { researchGoal, sourceText } }) => {
    // assume we want people entities only
    const response = await nerAgent.generate(
      dedent(`
Your task is to

1. identify occurences of _entities_ within the <source-text>, which correspond to the <entity-schema>s described below and are relevant to the <research-goal>; then
2. collect these entities in terms of their names, and their attributes (per <entity-schema> definition); and then
3. return these as a structured collection.

The parameters for this task are as follows:

<entity-schemas syntax="yaml">
${entityTypesToYaml([
  /* @ts-expect-error -- can't get this type */
  dereferencedPersonSchema,
])}
</entity-schemas>
<research-goal syntax="markdown>
${researchGoal}
</research-goal>
<source-text syntax="markdown">
${sourceText}
</source-text>
      `),
      {
        structuredOutput: {
          schema: nerPeopleOutputSchema,
        },
      }
    );
    return response.object;
  },
});

export const nerPeopleWorkflow = createWorkflow({
  id: 'ner-people-workflow',
  inputSchema: nerPeopleInputSchema,
  outputSchema: nerPeopleOutputSchema,
})
  .then(nerPeopleStep)
  .commit();
