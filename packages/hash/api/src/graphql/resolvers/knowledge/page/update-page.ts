import { SYSTEM_TYPES } from "../../../../graph/system-types";
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
  { dataSources: { graphApi }, userModel },
) => {
  const pageModel = await PageModel.getPageById(graphApi, { entityId });

  const updatedPageEntityModel = await pageModel.updateProperties(graphApi, {
    updatedProperties: Object.entries(updatedProperties).map(
      ([propertyName, value]) => ({
        propertyTypeBaseUri:
          SYSTEM_TYPES.propertyType[
            propertyName as keyof MutationUpdatePersistedPageArgs["updatedProperties"]
          ].getBaseUri(),
        value,
      }),
    ),
    actorId: userModel.getEntityUuid(),
  });

  const updatedPageModel = PageModel.fromEntityModel(updatedPageEntityModel);

  return mapPageModelToGQL(updatedPageModel);
};
