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
        "A policy that decides what happens next, e.g. 'rush orders jump the queue'. When the USER wants to compare versions of it, it is a lever.",
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
    v.pipe(
      v.literal("purpose"),
      v.description(
        "A question or goal the model exists to address, e.g. 'can we meet winter demand without a second dryer?'.",
      ),
    ),
    v.pipe(
      v.literal("direction"),
      v.description(
        "An objective to maximise or minimise a metric, e.g. 'minimise waiting time'. Claims describe which metric and which direction.",
      ),
    ),
    v.pipe(
      v.literal("target"),
      v.description(
        "A desired value that would count as success, e.g. 'the waiting-time service standard'. Claims describe the metric and its desired value.",
      ),
    ),
    v.pipe(
      v.literal("optimum"),
      v.description(
        "The best achievable setting or outcome to find, rather than a desired value already chosen, e.g. 'the best staffing level'. Claims describe what makes it best.",
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
        "Something the USER can change and wants to compare settings of, e.g. 'number of shifts', 'reorder point'.",
      ),
    ),
    v.pipe(
      v.literal("limit"),
      v.description(
        "A capacity or bound on an allowable resource, lever or rule setting, e.g. 'dryer capacity', 'the hiring cap'. Claims describe what is bounded and its value.",
      ),
    ),
    v.pipe(
      v.literal("threshold"),
      v.description(
        "A boundary an outcome must not cross, e.g. 'the maximum acceptable patient wait'. Claims describe the metric and its boundary value.",
      ),
    ),
    v.pipe(
      v.literal("horizon"),
      v.description(
        "A simulated time span the model runs over, e.g. 'the staffing horizon', 'the investment horizon'. Claims describe its duration.",
      ),
    ),
    v.pipe(
      v.literal("boundary"),
      v.description(
        "An inclusion, exclusion or interface with something outside the model, e.g. 'the supplier boundary'. Claims describe where the model stops and what crosses it.",
      ),
    ),
    v.pipe(
      v.literal("externality"),
      v.description(
        "An effect on something outside the model, e.g. 'downstream congestion', 'neighbourhood noise'. Claims describe the effect and who or what it affects.",
      ),
    ),
  ]),
  v.description(
    "What the entity is, not the role a claim gives it. Any kind can occur more than once.",
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

export const EntityKindSchema = toJsonSchema(vEntityKind);
export const EntitySchema = toJsonSchema(vEntity, { errorMode: "ignore" });
