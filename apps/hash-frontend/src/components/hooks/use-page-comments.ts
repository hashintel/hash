import { useQuery } from "@apollo/client";
import { Entity } from "@local/hash-graph-sdk/entity";
import type {
  EntityId,
  EntityMetadata,
  EntityTemporalVersioningMetadata,
} from "@local/hash-graph-types/entity";
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
  textUpdatedAt: EntityTemporalVersioningMetadata;
  author: Entity;
  parent: Entity;
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
          author: new Entity(comment.author),
          parent: new Entity(comment.parent),
          replies: comment.replies.map((reply) => ({
            ...reply,
            author: new Entity(reply.author),
            parent: new Entity(reply.parent),
          })),
        }))
      : emptyComments,
    loading,
  };
};
