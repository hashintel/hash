import { useQuery } from "@apollo/client";
import { TextToken } from "@local/hash-isomorphic-utils/types";
import {
  Entity,
  EntityId,
  EntityMetadata,
  EntityTemporalVersioningMetadata,
} from "@local/hash-subgraph";

import {
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

  return { data: data?.pageComments ?? emptyComments, loading };
};
