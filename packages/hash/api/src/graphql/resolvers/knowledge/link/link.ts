import { EntityModel, LinkModel, LinkTypeModel } from "../../../../model";
import {
  MutationCreatePersistedLinkArgs,
  MutationDeletePersistedLinkArgs,
  QueryOutgoingPersistedLinksArgs,
  ResolverFn,
} from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import {
  mapLinkModelToGQL,
  UnresolvedPersistedLinkGQL,
} from "../model-mapping";

export const createPersistedLink: ResolverFn<
  Promise<UnresolvedPersistedLinkGQL>,
  {},
  LoggedInGraphQLContext,
  MutationCreatePersistedLinkArgs
> = async (_, { link }, { dataSources: { graphApi } }) => {
  const { linkTypeId, ownedById, index, sourceEntityId, targetEntityId } = link;

  const [linkTypeModel, sourceEntityModel, targetEntityModel] =
    await Promise.all([
      LinkTypeModel.get(graphApi, {
        linkTypeId,
      }),
      EntityModel.getLatest(graphApi, {
        entityId: sourceEntityId,
      }),
      EntityModel.getLatest(graphApi, {
        entityId: targetEntityId,
      }),
    ]);

  const linkModel = await LinkModel.create(graphApi, {
    linkTypeModel,
    ownedById,
    index: index ?? undefined,
    sourceEntityModel,
    targetEntityModel,
  });

  return mapLinkModelToGQL(linkModel);
};

export const outgoingPersistedLinks: ResolverFn<
  Promise<UnresolvedPersistedLinkGQL[]>,
  {},
  LoggedInGraphQLContext,
  QueryOutgoingPersistedLinksArgs
> = async (
  _,
  { sourceEntityId, linkTypeId },
  { dataSources: { graphApi } },
) => {
  const linkModels = await LinkModel.getByQuery(graphApi, {
    all: [
      { eq: [{ path: ["source", "id"] }, { literal: sourceEntityId }] },
      linkTypeId
        ? {
            eq: [
              { path: ["type", "versionedUri"] },
              {
                literal: linkTypeId,
              },
            ],
          }
        : [],
    ].flat(),
  });

  return linkModels.map(mapLinkModelToGQL);
};

export const deletePersistedLink: ResolverFn<
  Promise<boolean>,
  {},
  LoggedInGraphQLContext,
  MutationDeletePersistedLinkArgs
> = async (_, { link }, { dataSources: { graphApi }, user }) => {
  const linkModel = await LinkModel.get(graphApi, link);

  await linkModel.remove(graphApi, { removedById: user.entityId });

  return true;
};
