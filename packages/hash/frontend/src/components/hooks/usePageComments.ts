import { useQuery } from "@apollo/client";
import { TextToken } from "@hashintel/hash-shared/graphql/types";
import {
  GetPersistedPageCommentsQuery,
  GetPersistedPageCommentsQueryVariables,
} from "../../graphql/apiTypes.gen";
import { getPersistedPageComments } from "../../graphql/queries/page.queries";

export type PageThread = PageComment & {
  replies: PageComment[];
};

export type PageComment = {
  ownedById: string;
  entityId: string;
  hasText: Array<TextToken>;
  textUpdatedAt: string;
  author: { entityId: string; properties: { preferredName?: string | null } };
  parent: { entityId: string };
};

export type PageCommentsInfo = {
  data: PageThread[];
  loading: boolean;
};

export const usePageComments = (
  ownedById: string,
  pageId: string,
): PageCommentsInfo => {
  const { data, loading } = useQuery<
    GetPersistedPageCommentsQuery,
    GetPersistedPageCommentsQueryVariables
  >(getPersistedPageComments, {
    variables: { ownedById, pageId },
  });

  return { data: data?.persistedPageComments ?? [], loading };
};
