import { calculateEntityDiff } from "../../../../graph/knowledge/primitive/entity.js";
import type {
  EntityDiff,
  Query,
  QueryGetEntityDiffsArgs,
  ResolverFn,
} from "../../../api-types.gen.js";
import type { GraphQLContext } from "../../../context.js";

export const getEntityDiffsResolver: ResolverFn<
  Query["getEntityDiffs"],
  Record<string, never>,
  GraphQLContext,
  QueryGetEntityDiffsArgs
> = async (_, { inputs }, graphQLContext) => {
  const {
    dataSources: { graphApi },
    provenance,
  } = graphQLContext;

  const entityDiffs: EntityDiff[] = await Promise.all(
    inputs.map(async (input) => {
      const diff = await calculateEntityDiff(
        { graphApi, provenance },
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
