import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import { ASK_TOOL_NAME, AskInput } from "@hashintel/brunch-agent/client-tools";

import { AWAITING_CLIENT } from "../client-tool.ts";

export const brunchAsk = defineTool({
  name: ASK_TOOL_NAME,
  description:
    "Ask one concise interview question. The browser executes this tool. After calling it, wait for a client-tool-result signal carrying the correlated { answer } output before continuing.",
  input: AskInput,
  output: v.object({
    awaiting: v.literal(AWAITING_CLIENT),
  }),
  run() {
    return { output: { awaiting: AWAITING_CLIENT }, terminate: true };
  },
});
