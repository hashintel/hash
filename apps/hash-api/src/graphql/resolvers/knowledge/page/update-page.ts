import { systemTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

import { updateEntityProperties } from "../../../../graph/knowledge/primitive/entity";
import {
  getPageById,
  getPageFromEntity,
} from "../../../../graph/knowledge/system-types/page";
import { MutationUpdatePageArgs, ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";
import { mapPageToGQL, UnresolvedPageGQL } from "../graphql-mapping";

export const updatePageResolver: ResolverFn<
  Promise<UnresolvedPageGQL>,
  {},
  LoggedInGraphQLContext,
  MutationUpdatePageArgs
> = async (
  _,
  { entityId, updatedProperties },
  { dataSources, authentication },
) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const page = await getPageById(context, authentication, { entityId });

  const updatedPageEntity = await updateEntityProperties(
    context,
    authentication,
    {
      entity: page.entity,
      updatedProperties: Object.entries(updatedProperties).map(
        ([propertyName, value]) => ({
          propertyTypeBaseUrl: extractBaseUrl(
            systemTypes.propertyType[
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
