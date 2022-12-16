import { SYSTEM_TYPES } from "../../../../graph/system-types";
import { PageModel } from "../../../../model";
import { MutationUpdatePageArgs, ResolverFn } from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { UnresolvedPageGQL, mapPageModelToGQL } from "../model-mapping";

export const updatePage: ResolverFn<
  Promise<UnresolvedPageGQL>,
  {},
  LoggedInGraphQLContext,
  MutationUpdatePageArgs
> = async (
  _,
  { entityId, updatedProperties },
  { dataSources: { graphApi }, userModel },
) => {
  const pageModel = await PageModel.getPageById(graphApi, { entityId });

  const updatedPageEntityModel = await pageModel.updateProperties(graphApi, {
    updatedProperties: Object.entries(updatedProperties).map(
      ([propertyName, value]) => ({
        propertyTypeBaseUri:
          SYSTEM_TYPES.propertyType[
            propertyName as keyof MutationUpdatePageArgs["updatedProperties"]
          ].metadata.editionId.baseId,
        value,
      }),
    ),
    actorId: userModel.getEntityUuid(),
  });

  const updatedPageModel = PageModel.fromEntityModel(updatedPageEntityModel);

  return mapPageModelToGQL(updatedPageModel);
};
