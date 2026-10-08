import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";

import { vOrigin, vStatus } from "../shared/epistemics.ts";

export const vEntityName = v.pipe(
  v.string(),
  v.minLength(1),
  v.description("A name for the entity in the USER's terms."),
);

export const vEntityKind = v.pipe(
  v.union([
    v.pipe(
      v.literal("thing"),
      v.description(
        "System: what moves through the system and is counted, transformed or consumed, e.g. 'orders', 'blanks', 'samples'.",
      ),
    ),
    v.pipe(
      v.literal("location"),
      v.description(
        "System: a place things are in or move between, where position matters to the answer, e.g. 'site B', 'ward 3'. When its capacity can run out, it is a resource.",
      ),
    ),
    v.pipe(
      v.literal("resource"),
      v.description(
        "System: something a step needs and holds while it runs, whose capacity can run out, e.g. 'the dryer', 'forklifts', 'nurses on shift'. Claims describe its capacity.",
      ),
    ),
    v.pipe(
      v.literal("activity"),
      v.description(
        "System: a step that takes time and turns inputs into outputs, e.g. 'drying', 'inspection'.",
      ),
    ),
    v.pipe(
      v.literal("actor"),
      v.description(
        "System: a person, team or organisation that performs steps or makes decisions, e.g. 'the planner', 'quality control'. When only how many are free matters, it is a resource.",
      ),
    ),
    v.pipe(
      v.literal("rule"),
      v.description(
        "System: a policy that decides what happens next, e.g. 'rush orders jump the queue', 'reorder when stock falls below 20'. When the USER wants to compare versions of it, it is a lever.",
      ),
    ),
    v.pipe(
      v.literal("event"),
      v.description(
        "System: something that happens at a moment rather than taking time, often from outside, e.g. 'a machine breaks down', 'a delivery arrives'.",
      ),
    ),
    v.pipe(
      v.literal("flow"),
      v.description(
        "System: a route things take through several activities from start to finish, e.g. 'order to dispatch', 'the rework loop'.",
      ),
    ),
    v.pipe(
      v.literal("purpose"),
      v.description(
        "Framing: a question or goal the model exists to address, e.g. 'can we meet winter demand without a second dryer?'.",
      ),
    ),
    v.pipe(
      v.literal("direction"),
      v.description(
        "Output: an objective to maximise or minimise a metric, e.g. 'minimise waiting time'. Claims describe which metric and which direction.",
      ),
    ),
    v.pipe(
      v.literal("target"),
      v.description(
        "Output: a desired value of a metric that would count as success, e.g. 'the waiting-time service standard'. Claims describe the metric and its desired value.",
      ),
    ),
    v.pipe(
      v.literal("optimum"),
      v.description(
        "Input: a setting of one or more levers to find, best by the directions it balances, rather than a value already chosen, e.g. 'the best staffing level'. Claims link it to its levers and directions.",
      ),
    ),
    v.pipe(
      v.literal("metric"),
      v.description(
        "Output: a quantity measured from a run that the answer is judged by, e.g. 'waiting time', 'weekly output'.",
      ),
    ),
    v.pipe(
      v.literal("lever"),
      v.description(
        "Input: something the USER can change and wants to compare settings of, e.g. 'number of shifts', 'reorder point'.",
      ),
    ),
    v.pipe(
      v.literal("limit"),
      v.description(
        "Input: a bound on what may be set or spent, e.g. 'the hiring cap', 'the overtime budget'. Claims describe what is bounded and its value. A resource's own capacity is a claim about that resource, not a limit.",
      ),
    ),
    v.pipe(
      v.literal("threshold"),
      v.description(
        "Output: a bound a run's outcome must not cross, e.g. 'the maximum acceptable patient wait'. Claims describe the metric and its bound. A level at which the operation itself acts is a rule.",
      ),
    ),
    v.pipe(
      v.literal("horizon"),
      v.description(
        "Scope: a simulated time span the model runs over, e.g. 'the staffing horizon', 'the investment horizon'. Claims describe its duration.",
      ),
    ),
    v.pipe(
      v.literal("boundary"),
      v.description(
        "Scope: an inclusion, exclusion or interface with something outside the model, e.g. 'the supplier boundary'. Claims describe where the model stops and what crosses it.",
      ),
    ),
    v.pipe(
      v.literal("externality"),
      v.description(
        "Output: an effect on something outside the model, e.g. 'downstream congestion', 'neighbourhood noise'. Claims describe the effect and who or what it affects.",
      ),
    ),
  ]),
  v.description(
    "What the entity is, not the role a claim gives it. Each kind opens with its stage relative to a run: framing (why the model exists), scope (its time span and edges), input (set before a run), system (how the operation behaves during a run) or output (what a run produces and how it is judged). Any kind can occur more than once.",
  ),
);

export const vEntity = v.pipe(
  v.strictObject({
    name: vEntityName,
    kind: vEntityKind,
    origin: vOrigin,
    status: vStatus,
  }),
  v.description(
    "An entity record. Origin and status describe its inclusion in the modelled account, independently of claims about it. Under entity/create the system assigns the ID; under entity/update the route addresses the entity and this payload replaces every field. Earlier records remain in the Ledger.",
  ),
);

export type EntityKind = v.InferOutput<typeof vEntityKind>;
export type Entity = v.InferOutput<typeof vEntity>;

export const entityStages = [
  "framing",
  "scope",
  "input",
  "system",
  "output",
] as const;

export type EntityStage = (typeof entityStages)[number];

/** Where each kind sits relative to a simulation run, in display order. */
export const entityKindStages = {
  purpose: "framing",
  horizon: "scope",
  boundary: "scope",
  lever: "input",
  limit: "input",
  optimum: "input",
  thing: "system",
  location: "system",
  resource: "system",
  activity: "system",
  actor: "system",
  rule: "system",
  event: "system",
  flow: "system",
  metric: "output",
  direction: "output",
  target: "output",
  threshold: "output",
  externality: "output",
} as const satisfies Record<EntityKind, EntityStage>;

export const EntityKindSchema = toJsonSchema(vEntityKind);
export const EntitySchema = toJsonSchema(vEntity, { errorMode: "ignore" });
