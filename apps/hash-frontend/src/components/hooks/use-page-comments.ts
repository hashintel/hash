import { useQuery } from "@apollo/client";
import { TextToken } from "@local/hash-isomorphic-utils/graphql/types";
import {
  Entity,
  EntityId,
  EntityMetadata,
  EntityVersion,
} from "@local/hash-types";

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
  textUpdatedAt: EntityVersion;
  author: Entity;
  parent: Entity;
  metadata: EntityMetadata;
};

export type PageCommentsInfo = {
  data: PageThread[];
  loading: boolean;
};

const emptyComments: PageThread[] = [];

export const usePageComments = (pageEntityId: EntityId): PageCommentsInfo => {
  const { data, loading } = useQuery<
    GetPageCommentsQuery,
    GetPageCommentsQueryVariables
  >(getPageComments, {
    variables: { entityId: pageEntityId },
  });

  return { data: data?.pageComments ?? emptyComments, loading };
};
