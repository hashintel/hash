import { useQuery } from "@apollo/client";
import { TextToken } from "@hashintel/hash-shared/graphql/types";
import {
  GetPageCommentsQuery,
  GetPageCommentsQueryVariables,
} from "../../graphql/apiTypes.gen";
import { getPageComments } from "../../graphql/queries/page.queries";

export type PageThread = PageComment & {
  replies: PageComment[];
};

export type PageComment = {
  accountId: string;
  entityId: string;
  tokens: Array<TextToken>;
  createdAt: string;
  textUpdatedAt: string;
  author: { entityId: string; properties: { preferredName?: string | null } };
  parent: { entityId: string };
};

export type PageCommentsInfo = {
  data: PageThread[];
  loading: boolean;
};

export const usePageComments = (
  accountId: string,
  pageId: string,
): PageCommentsInfo => {
  const { data, loading } = useQuery<
    GetPageCommentsQuery,
    GetPageCommentsQueryVariables
  >(getPageComments, {
    variables: { accountId, pageId },
  });

  return { data: data?.pageComments, loading };
};
