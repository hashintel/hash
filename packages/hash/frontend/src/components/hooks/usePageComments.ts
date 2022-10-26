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
  author: { entityId: string; properties: any };
  parent: { entityId: string };
};

export type PageCommentsInfo = {
  data: PageThread[];
  loading: boolean;
};

const emptyComments: PageThread[] = [];

export const usePageComments = (pageId: string): PageCommentsInfo => {
  const { data, loading } = useQuery<
    GetPersistedPageCommentsQuery,
    GetPersistedPageCommentsQueryVariables
  >(getPersistedPageComments, {
    variables: { entityId: pageId },
  });

  return { data: data?.persistedPageComments ?? emptyComments, loading };
};
