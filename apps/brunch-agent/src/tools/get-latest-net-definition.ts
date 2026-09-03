import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import { getLatestNetDefinitionToolName } from "@hashintel/petrinaut-core/ai";

import { AWAITING_CLIENT } from "../client-tool.ts";

export const getLatestNetDefinitionClientToolName =
  getLatestNetDefinitionToolName;

export const getLatestNetDefinition = defineTool({
  name: getLatestNetDefinitionClientToolName,
  description:
    "Get the live Petrinaut net state as `{ title, definition, extensions }`. The browser executes this tool. After you call it, wait for a client-tool-result signal carrying the current state, then continue from that state.",
  input: v.strictObject({}),
  output: v.object({
    awaiting: v.literal(AWAITING_CLIENT),
  }),
  run() {
    return { output: { awaiting: AWAITING_CLIENT }, terminate: true };
  },
});
