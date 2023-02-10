import { useQuery } from "@apollo/client";
import { TextToken } from "@local/hash-graphql-shared/graphql/types";
import { EntityId } from "@local/hash-graphql-shared/types";
import { Entity, EntityMetadata, EntityVersion } from "@local/hash-subgraph";

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
