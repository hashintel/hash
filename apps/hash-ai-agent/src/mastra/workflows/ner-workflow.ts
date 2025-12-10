/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

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
  id: "resolve-entity-types",
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
  id: "extract-entity-mentions",
  stateSchema: z.object({
    sourceText: z.string(),
    researchGoal: z.string(),
  }),
  inputSchema: z.object({
    dereferencedEntityTypes: z.array(z.object({})),
  }),
  outputSchema: z.object({}),
  execute: async (input) => {
    // collect all the entity mentions in the text, based on types definition
    return {};
  },
});

const extractObservations = createStep({
  id: "extract-observations",
  stateSchema: z.object({}),
  inputSchema: z.object({}),
  outputSchema: z.object({}),
  execute: async (input) => {
    // Step execution logic goes here
    return {};
  },
});

const deduplicateEntities = createStep({
  id: "deduplicate-entities",
  stateSchema: z.object({}),
  inputSchema: z.object({}),
  outputSchema: z.object({}),
  execute: async (input) => {
    // Step execution logic goes here
    return {};
  },
});

const proposeEntities = createStep({
  id: "propose-entities",
  stateSchema: z.object({}),
  inputSchema: z.object({}),
  outputSchema: z.object({}),
  execute: async (input) => {
    // Step execution logic goes here
    return {};
  },
});

export const nerWorkflow = createWorkflow({
  id: "ner-workflow",
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
