import { mergePropertiesAndMetadata } from "@local/hash-graph-sdk/entity";
import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { updateEntity } from "../../../../graph/knowledge/primitive/entity.js";
import {
  getPageById,
  getPageFromEntity,
} from "../../../../graph/knowledge/system-types/page.js";
import type {
  MutationUpdatePageArgs,
  ResolverFn,
} from "../../../api-types.gen.js";
import type { LoggedInGraphQLContext } from "../../../context.js";
import { graphQLContextToImpureGraphContext } from "../../util.js";
import type { UnresolvedPageGQL } from "../graphql-mapping.js";
import { mapPageToGQL } from "../graphql-mapping.js";

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
        const propertyTypeBaseUrl =
          systemPropertyTypes[
            propertyName as keyof MutationUpdatePageArgs["updatedProperties"]
          ].propertyTypeBaseUrl;

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
