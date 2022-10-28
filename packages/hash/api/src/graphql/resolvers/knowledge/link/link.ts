import { Filter } from "packages/graph/clients/typescript";
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
> = async (_, { link }, { dataSources: { graphApi }, userModel }) => {
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
    actorId: userModel.entityId,
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
  const filter: Filter = {
    all: [
      {
        equal: [{ path: ["source", "id"] }, { parameter: sourceEntityId }],
      },
    ],
  };

  if (linkTypeId) {
    filter.all.push({
      equal: [
        { path: ["type", "versionedUri"] },
        {
          parameter: linkTypeId,
        },
      ],
    });
  }

  const linkModels = await LinkModel.getByQuery(graphApi, filter);

  return linkModels.map(mapLinkModelToGQL);
};

export const deletePersistedLink: ResolverFn<
  Promise<boolean>,
  {},
  LoggedInGraphQLContext,
  MutationDeletePersistedLinkArgs
> = async (_, { link }, { dataSources: { graphApi }, userModel }) => {
  const linkModel = await LinkModel.get(graphApi, link);

  await linkModel.remove(graphApi, { actorId: userModel.entityId });

  return true;
};
