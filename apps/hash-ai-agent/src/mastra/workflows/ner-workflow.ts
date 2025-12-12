/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { createStep, createWorkflow } from '@mastra/core/workflows';
import dedent from 'dedent';
import { z } from 'zod';

import { entityExtractionAgent } from '../agents/entity-extraction-agent';
import { dereferencedPersonType } from '../fixtures/entity-types/person';
import { entityTypesToYaml } from '../utils/entity-type-to-yaml';

const workflowStateSchema = z.object({
  sourceText: z.string(),
  entityTypes: z.array(z.string()),
  researchGoal: z.string(),
  foundEntities: z.array(z.object({})),
  sourceMeta: z
    .object({
      uri: z.string().optional(),
      name: z.string().optional(),
      capturedAt: z.iso.datetime().optional(),
    })
    .optional(),
});

const workflowInputSchema = z.object({
  // ? do I need this ?
});

const resolveEntityTypes = createStep({
  id: 'resolve-entity-types',
  stateSchema: z.object({
    entityTypes: z.array(z.string()),
  }),
  inputSchema: workflowInputSchema, // empty
  outputSchema: z.object({
    dereferencedEntityTypes: z.array(z.object({})),
  }),
  execute: async (input) => {
    // resolve dereferenced types based on type name strings input
    return {
      dereferencedEntityTypes: [],
    };
  },
});

const extractEntityMentions = createStep({
  id: 'extract-entity-mentions',
  stateSchema: z.object({
    sourceText: z.string(),
    researchGoal: z.string(),
  }),
  inputSchema: z.object({
    dereferencedEntityTypes: z.array(z.object({})),
  }),
  outputSchema: z.object({}),
  execute: async ({ inputData, state }) => {
    // collect all the entity mentions in the text, based on types definition
    const response = await entityExtractionAgent.generate(state.researchGoal, {
      structuredOutput: {
        schema: z.object({}),
      },
    });
    return {};
  },
});

const extractObservations = createStep({
  id: 'extract-observations',
  stateSchema: z.object({}),
  inputSchema: z.object({}),
  outputSchema: z.object({}),
  execute: async (input) => {
    // Step execution logic goes here
    return {};
  },
});

const deduplicateEntities = createStep({
  id: 'deduplicate-entities',
  stateSchema: z.object({}),
  inputSchema: z.object({}),
  outputSchema: z.object({}),
  execute: async (input) => {
    // Step execution logic goes here
    return {};
  },
});

const proposeEntities = createStep({
  id: 'propose-entities',
  stateSchema: z.object({}),
  inputSchema: z.object({}),
  outputSchema: z.object({}),
  execute: async (input) => {
    // Step execution logic goes here
    return {};
  },
});

export const nerWorkflow = createWorkflow({
  id: 'ner-workflow',
  stateSchema: workflowStateSchema,
  inputSchema: workflowInputSchema,
  outputSchema: z.object({}),
})
  .then(resolveEntityTypes)
  .then(extractEntityMentions)
  .then(extractObservations)
  .then(deduplicateEntities)
  .then(proposeEntities)
  .commit();

const extractPeopleInputSchema = z.object({
  sourceText: z.string(),
  researchGoal: z.string(),
});

// const extractPeopleOutputSchema = z.object({
//   foundEntities: z.array(z.object({})),
// });
const extractPeopleOutputSchema = z.string();

const extractPeopleStep = createStep({
  id: 'extract-people-step',
  inputSchema: extractPeopleInputSchema,
  outputSchema: extractPeopleOutputSchema,
  execute: async ({ inputData: { researchGoal, sourceText } }) => {
    // assume we want people entities only
    const response = await entityExtractionAgent.generate(
      dedent(`
<source-text syntax="markdown">
  ${sourceText}
</source-text>
<research-goal syntax="markdown>
  ${researchGoal}
</research-goal>
<entity-types syntax="yaml">
  ${entityTypesToYaml([
    /* @ts-expect-error -- can't get this type */
    dereferencedPersonType,
  ])}
</entity-types>
      `)
      // {
      //   structuredOutput: {
      //     schema: z.object({
      //       foundEntities: z.array(z.object({})),
      //     }),
      //   },
      // }
    );
    return response.text;
    // return {
    //   foundEntities: response.object.foundEntities,
    // };
  },
});

export const extractPeopleWorkflow = createWorkflow({
  id: 'extract-people-workflow',
  inputSchema: extractPeopleInputSchema,
  outputSchema: extractPeopleOutputSchema,
})
  .then(extractPeopleStep)
  .commit();
