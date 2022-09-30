import { EntityModel, LinkModel, LinkTypeModel } from "../../../../model";
import {
  MutationCreateKnowledgeLinkArgs,
  QueryKnowledgeLinksArgs,
  ResolverFn,
} from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import {
  mapLinkModelToGQL,
  UnresolvedKnowledgeLinkGQL,
} from "../model-mapping";

export const createKnowledgeLink: ResolverFn<
  Promise<UnresolvedKnowledgeLinkGQL>,
  {},
  LoggedInGraphQLContext,
  MutationCreateKnowledgeLinkArgs
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

export const knowledgeLinks: ResolverFn<
  Promise<UnresolvedKnowledgeLinkGQL[]>,
  {},
  LoggedInGraphQLContext,
  QueryKnowledgeLinksArgs
> = async (
  _,
  { sourceEntityId, linkTypeId },
  { dataSources: { graphApi } },
) => {
  const linkModels = await LinkModel.getByQuery(graphApi, {
    all: [
      {
        eq: [{ path: ["source", "id"] }, { literal: sourceEntityId }],
      },
      {
        eq: [
          { path: ["type", "versionedUri"] },
          {
            literal: linkTypeId,
          },
        ],
      },
    ],
  });

  return linkModels.map(mapLinkModelToGQL);
};
