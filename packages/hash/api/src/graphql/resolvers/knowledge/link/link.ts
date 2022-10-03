import { ApolloError, UserInputError } from "apollo-server-errors";
import { EntityModel, LinkModel, LinkTypeModel } from "../../../../model";
import {
  MutationCreateKnowledgeLinkArgs,
  MutationDeleteKnowledgeLinkArgs,
  QueryOutgoingKnowledgeLinksArgs,
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

export const outgoingKnowledgeLinks: ResolverFn<
  Promise<UnresolvedKnowledgeLinkGQL[]>,
  {},
  LoggedInGraphQLContext,
  QueryOutgoingKnowledgeLinksArgs
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

export const deleteKnowledgeLink: ResolverFn<
  Promise<boolean>,
  {},
  LoggedInGraphQLContext,
  MutationDeleteKnowledgeLinkArgs
> = async (_, { link }, { dataSources: { graphApi }, user }) => {
  const { linkTypeId, sourceEntityId, targetEntityId } = link;

  const linkModels = await LinkModel.getByQuery(graphApi, {
    all: [
      { eq: [{ path: ["source", "id"] }, { literal: sourceEntityId }] },
      { eq: [{ path: ["target", "id"] }, { literal: targetEntityId }] },
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

  if (!linkModels[0]) {
    throw new ApolloError(
      `Link with source enitty ID = '${sourceEntityId}', target entity ID = '${targetEntityId}' and link type ID = '${linkTypeId}' not found.`,
      "NOT_FOUND",
    );
  } else if (linkModels.length > 1) {
    throw new UserInputError(`Could not identify one single link with query.`);
  }

  await linkModels[0].remove(graphApi, { removedById: user.entityId });

  return true;
};
