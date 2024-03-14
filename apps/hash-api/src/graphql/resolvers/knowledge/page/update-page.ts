import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

import { updateEntityProperties } from "../../../../graph/knowledge/primitive/entity";
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
import type { UnresolvedPageGQL } from "../graphql-mapping";
import { mapPageToGQL } from "../graphql-mapping";

export const updatePageResolver: ResolverFn<
  Promise<UnresolvedPageGQL>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationUpdatePageArgs
> = async (_, { entityId, updatedProperties }, graphQLContext) => {
  const { authentication } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const page = await getPageById(context, authentication, { entityId });

  const updatedPageEntity = await updateEntityProperties(
    context,
    authentication,
    {
      entity: page.entity,
      updatedProperties: Object.entries(updatedProperties).map(
        ([propertyName, value]) => ({
          propertyTypeBaseUrl: extractBaseUrl(
            systemPropertyTypes[
              propertyName as keyof MutationUpdatePageArgs["updatedProperties"]
            ].propertyTypeId,
          ),
          value: value ?? undefined,
        }),
      ),
    },
  );

  return mapPageToGQL(getPageFromEntity({ entity: updatedPageEntity }));
};
