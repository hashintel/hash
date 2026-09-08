import { Type } from "@earendil-works/pi-ai";
import { defineTool, useTool, type ToolInput } from "@flue/runtime";
import * as v from "valibot";
import { z } from "zod";

import {
  petrinautAiTools,
  normalizePetrinautAiToolInput,
} from "@hashintel/petrinaut-core/ai";

import type { AgentTool } from "@earendil-works/pi-agent-core";

const scenario = defineTool({
  name: "scenario",
  description: "Type diagnostic",
  input: petrinautAiTools.addScenario.inputSchema,
  run({ data, toolCallId, signal }) {
    const native: z.output<typeof petrinautAiTools.addScenario.inputSchema> =
      data;
    const id: string = toolCallId;
    const abort: AbortSignal | undefined = signal;
    void native;
    void id;
    void abort;
    // The runtime passes validated output, including applied defaults.
    const overrides: NonNullable<typeof data.parameterOverrides> =
      data.parameterOverrides;
    void overrides;
    // @ts-expect-error -- No field mirroring or loss to unknown/any.
    void data.notACanonicalField;
    return { output: { id: data.id }, terminate: true };
  },
});
const input: ToolInput<typeof scenario> = {
  id: "scenario",
  name: "Scenario",
  scenarioParameters: [],
  initialState: { type: "per_place", content: {} },
};
void input;
const transformed = defineTool({
  name: "transformed",
  description: "Native output inference",
  input: z
    .object({ label: z.string() })
    .transform(({ label }) => ({ count: label.length })),
  run({ data }) {
    const count: number = data.count;
    // @ts-expect-error -- Input is not run.data after the native transform.
    void data.label;
    return { output: count, terminate: true };
  },
});
void transformed;
const projected = Type.Object({ value: Type.String() });
const piTool: AgentTool<
  typeof projected,
  { count: number },
  { count: number }
> = {
  name: "native",
  label: "native",
  description: "Different parsed output",
  parameters: projected,
  validateArguments(args, { toolCallId, signal }) {
    const id: string = toolCallId;
    const abort: AbortSignal | undefined = signal;
    void id;
    void abort;
    return z
      .object({ value: z.string() })
      .transform(({ value }) => ({ count: value.length }))
      .parse(args);
  },
  async execute(_id, data) {
    // @ts-expect-error -- Parsed native output is not the input projection.
    void data.value;
    return { content: [], details: { count: data.count } };
  },
};
void piTool;
useTool({
  name: "inline",
  description: "Inline generic inference",
  input: petrinautAiTools.addArc.inputSchema,
  prepareArguments: (args) => normalizePetrinautAiToolInput("addArc", args),
  run({ data }) {
    const native: z.output<typeof petrinautAiTools.addArc.inputSchema> = data;
    return { output: native.weight };
  },
});
const legacy = defineTool({
  name: "valibot",
  description: "Unchanged Valibot output",
  input: v.object({ count: v.optional(v.number(), 3) }),
  output: v.number(),
  run({ data }) {
    const count: number = data.count;
    return { output: count, terminate: true };
  },
});
const legacyInput: ToolInput<typeof legacy> = {};
void legacyInput;
defineTool({
  name: "invalid-output",
  description: "Output schema remains enforced",
  output: v.number(),
  // @ts-expect-error -- Native input support does not erase output typing.
  run() {
    return { output: "not a number" };
  },
});
