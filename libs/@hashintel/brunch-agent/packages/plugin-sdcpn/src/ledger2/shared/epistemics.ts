import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";

export const vOrigin = v.pipe(
  v.union([
    v.pipe(
      v.literal("assumed"),
      v.description(
        "The agent supplied a stand-in that nothing said supports.",
      ),
    ),
    v.pipe(
      v.literal("inferred"),
      v.description("The agent derived it from what was said."),
    ),
    v.pipe(
      v.literal("evidenced"),
      v.description("It is in material the USER shared."),
    ),
    v.pipe(v.literal("stated"), v.description("The USER said it.")),
  ]),
  v.description(
    "Where the entry's content came from, independently of whether the USER has agreed to it.",
  ),
);

export const vStatus = v.pipe(
  v.union([
    v.pipe(
      v.literal("open"),
      v.description("It matters and nobody knows yet."),
    ),
    v.pipe(
      v.literal("tentative"),
      v.description(
        "The USER hedged, or the agent proposed it and the USER has not agreed yet.",
      ),
    ),
    v.pipe(
      v.literal("confirmed"),
      v.description(
        "The USER said it without hedging, or agreed when asked. Only the USER's words establish confirmation.",
      ),
    ),
    v.pipe(
      v.literal("conflicted"),
      v.description("Accounts disagree and the USER has not said which holds."),
    ),
    v.pipe(
      v.literal("out-of-scope"),
      v.description("The USER agreed it stays outside the model."),
    ),
  ]),
  v.description(
    "Whether the USER has agreed to this entry. Each entry's status is independent.",
  ),
);

export type Origin = v.InferOutput<typeof vOrigin>;
export type Status = v.InferOutput<typeof vStatus>;

export const OriginSchema = toJsonSchema(vOrigin);
export const StatusSchema = toJsonSchema(vStatus);
