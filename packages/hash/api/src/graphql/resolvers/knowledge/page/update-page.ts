import { WORKSPACE_TYPES } from "../../../../graph/workspace-types";
import { PageModel } from "../../../../model";
import {
  MutationUpdatePersistedPageArgs,
  ResolverFn,
} from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import {
  UnresolvedPersistedPageGQL,
  mapPageModelToGQL,
} from "../model-mapping";

export const updatePersistedPage: ResolverFn<
  Promise<UnresolvedPersistedPageGQL>,
  {},
  LoggedInGraphQLContext,
  MutationUpdatePersistedPageArgs
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
            propertyName as keyof MutationUpdatePersistedPageArgs["updatedProperties"]
          ].baseUri,
        value,
      }),
    ),
  });

  const updatedPageModel = PageModel.fromEntityModel(updatedPageEntityModel);

  return mapPageModelToGQL(updatedPageModel);
};
