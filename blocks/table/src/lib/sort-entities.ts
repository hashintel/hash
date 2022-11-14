import { AggregateOperationInput } from "@blockprotocol/graph";
import { orderBy } from "lodash";

export const sortEntities = (
  entities: unknown[],
  multiSort: NonNullable<AggregateOperationInput["multiSort"]>,
) => {
  return orderBy(
    entities,
    multiSort.map(({ field }) => field),
    multiSort.map(({ desc }) => (desc ? "desc" : "asc")),
  );
};
