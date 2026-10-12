import * as v from "valibot";

export const entityIdGrammar = String.raw`e(?:0|[1-9]\d*)`;

export const vEntityId = v.pipe(
  v.string(),
  v.regex(new RegExp(`^${entityIdGrammar}$`)),
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
    "A reference to the zero-based position in this call's entire entries queue, such as $0. Use only in reference fields, never in a route.",
  ),
);

export const vEntityReference = v.pipe(
  v.union([vEntityId, vLocalReference]),
  v.description(
    "An existing entity ID (e23), or a same-call queue reference ($0) whose target is an entity entry.",
  ),
);

export const vClaimReference = v.pipe(
  v.union([vClaimId, vLocalReference]),
  v.description(
    "An existing claim ID (c45), or a same-call queue reference ($1) whose target is a claim entry.",
  ),
);

export const vObligationId = v.pipe(
  v.string(),
  v.regex(/^o(?:0|[1-9]\d*)$/),
  v.brand("ObligationId"),
  v.description("An existing obligation ID issued by the system, such as o7."),
);

export const vObligationReference = v.pipe(
  v.union([vObligationId, vLocalReference]),
  v.description(
    "An existing obligation ID (o7), or a same-call queue reference ($2) whose target is an obligation entry.",
  ),
);
