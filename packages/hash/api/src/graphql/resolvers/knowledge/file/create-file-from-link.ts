import { OwnedById } from "@hashintel/hash-shared/types";
import { Entity } from "@hashintel/hash-subgraph";

import { createFileFromExternalLink } from "../../../../graph/knowledge/system-types/file";
import {
  MutationCreateFileFromLinkArgs,
  ResolverFn,
} from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";

// function guessFileNameFromURL(url: string): string {
//   const fileNameRegex = /[^/\\&?]+\w+(?=([?&].*$|$))/;
//   const fileName = url.match(fileNameRegex);
//   if (fileName && fileName.length > 0) {
//     return fileName[0]!;
//   } else {
//     return genId();
//   }
// }

export const createFileFromLink: ResolverFn<
  Promise<Entity>,
  {},
  LoggedInGraphQLContext,
  MutationCreateFileFromLinkArgs
> = async (_, { mediaType, url }, { dataSources, user }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const entity = await createFileFromExternalLink(context, {
    actorId: user.accountId,
    ownedById: user.accountId as OwnedById,
    mediaType,
    url,
  });

  return entity;
};
