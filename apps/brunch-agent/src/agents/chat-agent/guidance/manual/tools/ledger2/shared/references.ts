import * as v from "valibot";

export const vEntityId = v.pipe(
  v.string(),
  v.regex(/^e(?:0|[1-9]\d*)$/),
  v.brand("EntityId"),
  v.description("An existing entity ID issued by the system, such as e23."),
);

export const vClaimId = v.pipe(
  v.string(),
  v.regex(/^c(?:0|[1-9]\d*)$/),
  v.brand("ClaimId"),
  v.description("An existing claim ID issued by the system, such as c45."),
);

const vLocalReference = v.pipe(
  v.string(),
  v.regex(/^\$(?:0|[1-9]\d*)$/),
  v.brand("LocalReference"),
  v.description(
    "A reference to the zero-based position in this call's entire entries queue, such as $0. Use only in reference fields; do not assign it as an entry's own ID.",
  ),
);

export const vEntityReference = v.pipe(
  v.union([vEntityId, vLocalReference]),
  v.description(
    "An existing entity ID (e23), or a same-call queue reference ($0) whose target is an elicitation.entity entry.",
  ),
);

export const vClaimReference = v.pipe(
  v.union([vClaimId, vLocalReference]),
  v.description(
    "An existing claim ID (c45), or a same-call queue reference ($1) whose target is an elicitation.claim entry.",
  ),
);
