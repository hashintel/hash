import { updateEntityProperties } from "../../../../graph/knowledge/primitive/entity";
import {
  getPageById,
  getPageFromEntity,
} from "../../../../graph/knowledge/system-types/page";
import { SYSTEM_TYPES } from "../../../../graph/system-types";
import { MutationUpdatePageArgs, ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { mapPageToGQL, UnresolvedPageGQL } from "../graphql-mapping";

export const updatePageResolver: ResolverFn<
  Promise<UnresolvedPageGQL>,
  {},
  LoggedInGraphQLContext,
  MutationUpdatePageArgs
> = async (
  _,
  { entityId, updatedProperties },
  { dataSources: { graphApi }, user },
) => {
  const page = await getPageById({ graphApi }, { entityId });

  const updatedPageEntity = await updateEntityProperties(
    { graphApi },
    {
      entity: page.entity,
      updatedProperties: Object.entries(updatedProperties).map(
        ([propertyName, value]) => ({
          propertyTypeBaseUri:
            SYSTEM_TYPES.propertyType[
              propertyName as keyof MutationUpdatePageArgs["updatedProperties"]
            ].metadata.editionId.baseId,
          value: value ?? undefined,
        }),
      ),
      actorId: user.accountId,
    },
  );

  return mapPageToGQL(getPageFromEntity({ entity: updatedPageEntity }));
};
