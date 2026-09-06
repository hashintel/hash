import { defineTool } from "@flue/runtime";
import * as v from "valibot";

export const PING_TOOL_NAME = "ping";

export const ping = defineTool({
  name: PING_TOOL_NAME,
  description:
    "Return a short server-side acknowledgement. Call this when you need to confirm the server is in the loop.",
  input: v.object({
    note: v.optional(v.pipe(v.string(), v.nonEmpty())),
  }),
  output: v.object({
    ok: v.literal(true),
    note: v.string(),
  }),
  run({ data }) {
    return { output: { ok: true as const, note: data.note ?? "pong" } };
  },
});
