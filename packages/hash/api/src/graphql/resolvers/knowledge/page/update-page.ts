import { WORKSPACE_TYPES } from "../../../../graph/workspace-types";
import { PageModel } from "../../../../model";
import {
  MutationUpdateKnowledgePageArgs,
  ResolverFn,
} from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import {
  UnresolvedKnowledgePageGQL,
  mapPageModelToGQL,
} from "../model-mapping";

export const updateKnowledgePage: ResolverFn<
  Promise<UnresolvedKnowledgePageGQL>,
  {},
  LoggedInGraphQLContext,
  MutationUpdateKnowledgePageArgs
> = async (
  _,
  { entityId, updatedProperties },
  { dataSources: { graphApi } },
) => {
  const pageModel = await PageModel.getPageById(graphApi, { entityId });

  const updatedPageEntityModel = await pageModel.updateProperties(graphApi, {
    updatedProperties: Object.entries(updatedProperties).map(
      ([propertyName, value]) => ({
        propertyTypeBaseUri:
          WORKSPACE_TYPES.propertyType[
            propertyName as keyof MutationUpdateKnowledgePageArgs["updatedProperties"]
          ].baseUri,
        value,
      }),
    ),
  });

  const updatedPageModel = PageModel.fromEntityModel(updatedPageEntityModel);

  return mapPageModelToGQL(updatedPageModel);
};
