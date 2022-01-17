import { BlockProtocolAggregateOperationInput } from "blockprotocol";
import { orderBy } from "lodash";

export const sortEntities = (
  entities: any[],
  multiSort: NonNullable<BlockProtocolAggregateOperationInput["multiSort"]>,
) => {
  return orderBy(
    entities,
    multiSort.map(({ field }) => field),
    multiSort.map(({ desc }) => (desc ? "desc" : "asc")),
  );
};
