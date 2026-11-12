/**
 * The HASH agent's graph reads as Flue tools. Their inputs and results are the
 * shared contract in `@hashintel/brunch-agent`, as are how each is described
 * to the model and what the model is shown of its result; HASH's process page
 * executes them as the signed-in user.
 */

import { defineTool } from "@flue/runtime";

import {
  brunchTools,
  hashEntityReadDescription,
  hashEntityReadForModel,
  hashEntityTypeReadDescription,
  hashEntityTypeReadForModel,
  hashReadFailureForModel,
  hashWebReadDescription,
  hashWebReadForModel,
  vHashEntityReadInput,
  vHashEntityTypeReadInput,
  vHashWebReadInput,
} from "@hashintel/brunch-agent";

import {
  type BrowserToolExecutor,
  browserResultEnvelope,
} from "../../../shared/conversation/browser-tool-executor.ts";

/** Issues one read to HASH's page and shows the model what it settled with. */
const runHashRead = async (
  execute: BrowserToolExecutor,
  call: {
    readonly toolName: string;
    readonly input: unknown;
    readonly toolCallId: string;
    readonly signal?: AbortSignal;
  },
  forModel: (output: unknown) => string,
) => {
  const result = await execute(call);
  return {
    output: browserResultEnvelope({
      ...result,
      output: hashReadFailureForModel(result.output) ?? forModel(result.output),
    }),
    terminate: false,
  };
};

/** The entity read, executed by whatever `execute` reaches HASH through. */
export const createHashEntityReadTool = (execute: BrowserToolExecutor) =>
  defineTool({
    name: brunchTools.hashQueryEntities,
    description: hashEntityReadDescription,
    input: vHashEntityReadInput,
    run: ({ data, toolCallId, signal }) =>
      runHashRead(
        execute,
        {
          toolName: brunchTools.hashQueryEntities,
          input: data,
          toolCallId,
          signal,
        },
        (output) => hashEntityReadForModel(output, data.fullValuesFor),
      ),
  });

/** The entity type read, executed by whatever `execute` reaches HASH through. */
export const createHashEntityTypeReadTool = (execute: BrowserToolExecutor) =>
  defineTool({
    name: brunchTools.hashQueryEntityTypes,
    description: hashEntityTypeReadDescription,
    input: vHashEntityTypeReadInput,
    run: ({ data, toolCallId, signal }) =>
      runHashRead(
        execute,
        {
          toolName: brunchTools.hashQueryEntityTypes,
          input: data,
          toolCallId,
          signal,
        },
        hashEntityTypeReadForModel,
      ),
  });

/** The web read, executed by whatever `execute` reaches HASH through. */
export const createHashWebReadTool = (execute: BrowserToolExecutor) =>
  defineTool({
    name: brunchTools.hashQueryWebs,
    description: hashWebReadDescription,
    input: vHashWebReadInput,
    run: ({ data, toolCallId, signal }) =>
      runHashRead(
        execute,
        {
          toolName: brunchTools.hashQueryWebs,
          input: data,
          toolCallId,
          signal,
        },
        hashWebReadForModel,
      ),
  });

/** Every HASH graph read, executed by whatever `execute` reaches HASH through. */
export const createHashGraphReadTools = (execute: BrowserToolExecutor) => [
  createHashEntityReadTool(execute),
  createHashEntityTypeReadTool(execute),
  createHashWebReadTool(execute),
];
