import { mergePropertiesAndMetadata } from "@local/hash-graph-sdk/entity";
import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { updateEntity } from "../../../../graph/knowledge/primitive/entity";
import {
  getPageById,
  getPageFromEntity,
} from "../../../../graph/knowledge/system-types/page";
import type {
  MutationUpdatePageArgs,
  ResolverFn,
} from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";
import type { mapPageToGQL, UnresolvedPageGQL } from "../graphql-mapping";

export const updatePageResolver: ResolverFn<
  Promise<UnresolvedPageGQL>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationUpdatePageArgs
> = async (_, { entityId, updatedProperties }, graphQLContext) => {
  const { authentication } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const page = await getPageById(context, authentication, { entityId });

  const updatedPageEntity = await updateEntity(context, authentication, {
    entity: page.entity,
    propertyPatches: Object.entries(updatedProperties).map(
      ([propertyName, value]) => {
        const { propertyTypeBaseUrl } =
          systemPropertyTypes[
            propertyName as keyof MutationUpdatePageArgs["updatedProperties"]
          ];

        return {
          op: "add",
          path: [propertyTypeBaseUrl],
          property: mergePropertiesAndMetadata(value, undefined),
        };
      },
    ),
  });

  return mapPageToGQL(getPageFromEntity({ entity: updatedPageEntity }));
};
