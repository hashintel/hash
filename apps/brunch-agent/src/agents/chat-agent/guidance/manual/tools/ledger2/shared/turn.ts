import * as v from "valibot";

export const vTurn = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.description("The conversation turn in which this entry was recorded."),
);
