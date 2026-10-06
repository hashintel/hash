import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";

export const vDemo = v.pipe(
  v.union([
    v.pipe(
      v.literal("inspect"),
      v.description(
        "Read files and report findings without modifying anything.",
      ),
    ),
    v.pipe(
      v.literal("propose"),
      v.description(
        "Prepare suggested changes, but wait for approval before applying them.",
      ),
    ),
    v.pipe(
      v.literal("apply"),
      v.description("Modify files directly within the permitted scope."),
    ),
  ]),
  v.description("How the agent should handle proposed changes."),
);

export type Demo = v.InferOutput<typeof vDemo>;

export const DemoSchema = toJsonSchema(vDemo);

export const vClaimKind = v.pipe(
  v.union([
    v.pipe(
      v.literal("direction"),
      v.description(
        "Which way a metric should move: maximise or minimise, e.g. 'minimise waiting time'.",
      ),
    ),
    v.pipe(
      v.literal("target"),
      v.description(
        "The value of a metric the person would count as success, e.g. 'average wait under 4 hours'.",
      ),
    ),
    v.pipe(
      v.literal("threshold"),
      v.description(
        "The value of a metric the outcome must never cross, whatever else improves, e.g. 'no patient waits over 12 hours'.",
      ),
    ),
    v.pipe(
      v.literal("limit"),
      v.description(
        "A cap on a resource, lever or rule that the system cannot exceed, e.g. 'the dryer holds at most 40 kg'.",
      ),
    ),
  ]),
  v.description(
    "What the claim fixes about the metric, resource or lever it refers to. Leave it out for any other claim.",
  ),
);

export type ClaimKind = v.InferOutput<typeof vClaimKind>;

export const ClaimKindSchema = toJsonSchema(vClaimKind); //?

export const vEntityKind = v.pipe(
  v.union([
    // Framing
    v.pipe(
      v.literal("purpose"),
      v.description(
        "The question the model exists to answer, e.g. 'can we meet winter demand without a second dryer?'. Exactly one exists from the start.",
      ),
    ),
    v.pipe(
      v.literal("horizon"),
      v.description(
        "How much simulated time the model runs over, e.g. '104 weeks'. Exactly one exists from the start.",
      ),
    ),
    v.pipe(
      v.literal("boundary"),
      v.description(
        "Where the model stops and how outside things enter it, e.g. 'suppliers are outside; deliveries arrive weekly'. Exactly one exists from the start.",
      ),
    ),
    v.pipe(
      v.literal("metric"),
      v.description(
        "A quantity measured from a run that the answer is judged by, e.g. 'waiting time', 'weekly output'.",
      ),
    ),
    v.pipe(
      v.literal("lever"),
      v.description(
        "Something the person can change and wants to compare settings of, e.g. 'number of shifts', 'reorder point'.",
      ),
    ),
    // Domain
    v.pipe(
      v.literal("thing"),
      v.description(
        "What moves through the system and is counted, transformed or consumed, e.g. 'orders', 'blanks', 'samples'.",
      ),
    ),
    v.pipe(
      v.literal("location"),
      v.description(
        "A place things are in or move between, where position matters to the answer, e.g. 'site B', 'ward 3'. When its capacity can run out, it is a resource.",
      ),
    ),
    v.pipe(
      v.literal("resource"),
      v.description(
        "Something a step needs and holds while it runs, whose capacity can run out, e.g. 'the dryer', 'forklifts', 'nurses on shift'.",
      ),
    ),
    v.pipe(
      v.literal("activity"),
      v.description(
        "A step that takes time and turns inputs into outputs, e.g. 'drying', 'inspection'.",
      ),
    ),
    v.pipe(
      v.literal("actor"),
      v.description(
        "A person, team or organisation that performs steps or makes decisions, e.g. 'the planner', 'quality control'. When only how many are free matters, it is a resource.",
      ),
    ),
    v.pipe(
      v.literal("rule"),
      v.description(
        "A policy that decides what happens next, e.g. 'rush orders jump the queue'. When the person wants to compare versions of it, it is a lever.",
      ),
    ),
    v.pipe(
      v.literal("event"),
      v.description(
        "Something that happens at a moment rather than taking time, often from outside, e.g. 'a machine breaks down', 'a delivery arrives'.",
      ),
    ),
    v.pipe(
      v.literal("flow"),
      v.description(
        "A route things take through several activities from start to finish, e.g. 'order to dispatch', 'the rework loop'.",
      ),
    ),
  ]),
  v.description(
    "What the entity is. Never create a purpose, horizon or boundary; refer to the ones that exist.",
  ),
);

export type EntityKind = v.InferOutput<typeof vEntityKind>;

export const EntityKindSchema = toJsonSchema(vEntityKind); //?
