import { LinkModel } from "../../../../model";
import { QueryKnowledgeLinksArgs, ResolverFn } from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import {
  mapLinkModelToGQL,
  UnresolvedKnowledgeLinkGQL,
} from "../model-mapping";

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
