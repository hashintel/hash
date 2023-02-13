import { updateEntityProperties } from "../../../../graph/knowledge/primitive/entity";
import {
  getPageById,
  getPageFromEntity,
} from "../../../../graph/knowledge/system-types/page";
import { SYSTEM_TYPES } from "../../../../graph/system-types";
import { MutationUpdatePageArgs, ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";
import { mapPageToGQL, UnresolvedPageGQL } from "../graphql-mapping";

export const updatePageResolver: ResolverFn<
  Promise<UnresolvedPageGQL>,
  {},
  LoggedInGraphQLContext,
  MutationUpdatePageArgs
> = async (_, { entityId, updatedProperties }, { dataSources, user }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const page = await getPageById(context, { entityId });

  const updatedPageEntity = await updateEntityProperties(context, {
    entity: page.entity,
    updatedProperties: Object.entries(updatedProperties).map(
      ([propertyName, value]) => ({
        propertyTypeBaseUri:
          SYSTEM_TYPES.propertyType[
            propertyName as keyof MutationUpdatePageArgs["updatedProperties"]
          ].metadata.recordId.baseUri,
        value: value ?? undefined,
      }),
    ),
    actorId: user.accountId,
  });

  return mapPageToGQL(getPageFromEntity({ entity: updatedPageEntity }));
};
