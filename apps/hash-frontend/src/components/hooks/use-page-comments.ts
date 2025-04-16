import { useQuery } from "@apollo/client";
import type {
  EntityId,
  EntityMetadata,
  EntityTemporalMetadata,
} from "@blockprotocol/type-system";
import { HashEntity } from "@local/hash-graph-sdk/entity";
import type { TextToken } from "@local/hash-isomorphic-utils/types";

import type {
  GetPageCommentsQuery,
  GetPageCommentsQueryVariables,
} from "../../graphql/api-types.gen";
import { getPageComments } from "../../graphql/queries/page.queries";

export type PageThread = PageComment & {
  replies: PageComment[];
};

export type PageComment = {
  hasText: Array<TextToken>;
  textUpdatedAt: EntityTemporalMetadata;
  author: HashEntity;
  parent: HashEntity;
  metadata: EntityMetadata;
};

export type PageCommentsInfo = {
  data: PageThread[];
  loading: boolean;
};

const emptyComments: PageThread[] = [];

export const usePageComments = (pageEntityId?: EntityId): PageCommentsInfo => {
  const { data, loading } = useQuery<
    GetPageCommentsQuery,
    GetPageCommentsQueryVariables
  >(getPageComments, {
    variables: { entityId: pageEntityId! },
    pollInterval: 10_000,
    skip: !pageEntityId,
  });

  const pageComments = data?.pageComments;
  return {
    data: pageComments
      ? pageComments.map((comment) => ({
          ...comment,
          author: new HashEntity(comment.author),
          parent: new HashEntity(comment.parent),
          replies: comment.replies.map((reply) => ({
            ...reply,
            author: new HashEntity(reply.author),
            parent: new HashEntity(reply.parent),
          })),
        }))
      : emptyComments,
    loading,
  };
};
