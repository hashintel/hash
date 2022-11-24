import { useQuery } from "@apollo/client";
import { TextToken } from "@hashintel/hash-shared/graphql/types";
import {
  EntityId,
  EntityMetadata,
  EntityWithMetadata,
} from "@hashintel/hash-subgraph";
import {
  GetPersistedPageCommentsQuery,
  GetPersistedPageCommentsQueryVariables,
} from "../../graphql/apiTypes.gen";
import { getPersistedPageComments } from "../../graphql/queries/page.queries";

export type PageThread = PageComment & {
  replies: PageComment[];
};

export type PageComment = {
  hasText: Array<TextToken>;
  textUpdatedAt: string;
  author: EntityWithMetadata;
  parent: EntityWithMetadata;
  metadata: EntityMetadata;
};

export type PageCommentsInfo = {
  data: PageThread[];
  loading: boolean;
};

const emptyComments: PageThread[] = [];

export const usePageComments = (pageEntityId: EntityId): PageCommentsInfo => {
  const { data, loading } = useQuery<
    GetPersistedPageCommentsQuery,
    GetPersistedPageCommentsQueryVariables
  >(getPersistedPageComments, {
    variables: { entityId: pageEntityId },
  });

  return { data: data?.persistedPageComments ?? emptyComments, loading };
};
