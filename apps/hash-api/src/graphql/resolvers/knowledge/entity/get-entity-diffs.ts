import { calculateEntityDiff } from "../../../../graph/knowledge/primitive/entity";
import type {
  EntityDiff,
  Query,
  QueryGetEntityDiffsArgs,
  ResolverFn,
} from "../../../api-types.gen";
import type { GraphQLContext } from "../../../context";

export const getEntityDiffsResolver: ResolverFn<
  Query["getEntityDiffs"],
  Record<string, never>,
  GraphQLContext,
  QueryGetEntityDiffsArgs
> = async (_, { inputs }, graphQLContext) => {
  const {
    dataSources: { graphApi },
  } = graphQLContext;

  const entityDiffs: EntityDiff[] = await Promise.all(
    inputs.map(async (input) => {
      const diff = await calculateEntityDiff(
        { graphApi },
        graphQLContext.authentication,
        input,
      );

      return {
        diff,
        input,
      };
    }),
  );

  return entityDiffs;
};
