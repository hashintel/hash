import { useQuery } from "@apollo/client";
import type {
  EntityId,
  SimpleEntityMetadata,
  EntityTemporalVersioningMetadata,
  SimpleEntity,
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
  author: SimpleEntity;
  parent: SimpleEntity;
  metadata: SimpleEntityMetadata;
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
