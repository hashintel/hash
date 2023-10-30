import { useQuery } from "@apollo/client";
import { VersionedUrl } from "@blockprotocol/type-system";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-graphql-shared/graphql/types";
import { TextProperties } from "@local/hash-isomorphic-utils/entity";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
/** @todo: figure out why this isn't in `@local/hash-isomorphic-utils/system-types/shared` */
import {
  CommentNotificationProperties,
  CommentProperties,
  PageProperties,
  UserProperties,
} from "@local/hash-isomorphic-utils/system-types/commentnotification";
/** @todo: figure out why this isn't in `@local/hash-isomorphic-utils/system-types/shared` */
import { MentionNotificationProperties } from "@local/hash-isomorphic-utils/system-types/mentionnotification";
import {
  Entity,
  EntityRootType,
  LinkEntityAndRightEntity,
} from "@local/hash-subgraph";
import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import {
  createContext,
  FunctionComponent,
  PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
} from "react";

import {
  StructuralQueryEntitiesQuery,
  StructuralQueryEntitiesQueryVariables,
} from "../graphql/api-types.gen";
import { structuralQueryEntitiesQuery } from "../graphql/queries/knowledge/entity.queries";
import { constructMinimalUser, MinimalUser } from "../lib/user-and-org";
import { useAuthInfo } from "../pages/shared/auth-info-context";

type PageMentionNotification = {
  kind: "page-mention";
  entity: Entity<MentionNotificationProperties>;
  occurredInPage: Entity<PageProperties>;
  occurredInText: Entity<TextProperties>;
  triggeredByUser: MinimalUser;
};

type CommentMentionNotification = {
  kind: "comment-mention";
  occurredInComment: Entity<CommentProperties>;
} & Omit<PageMentionNotification, "kind">;

type NewCommentNotification = {
  kind: "new-comment";
  entity: Entity<CommentNotificationProperties>;
  occurredInPage: Entity<PageProperties>;
  triggeredByComment: Entity<CommentProperties>;
  triggeredByUser: MinimalUser;
};

type CommentReplyNotification = {
  kind: "comment-reply";
  repliedToComment: Entity<CommentProperties>;
} & Omit<NewCommentNotification, "kind">;

type Notification =
  | PageMentionNotification
  | CommentMentionNotification
  | NewCommentNotification
  | CommentReplyNotification;

export type NotificationsContextValues = {
  notifications?: Notification[];
  loading: boolean;
  refetch: () => Promise<void>;
};

export const NotificationsContext =
  createContext<null | NotificationsContextValues>(null);

export const useNotifications = () => {
  const notificationsContext = useContext(NotificationsContext);

  if (!notificationsContext) {
    throw new Error("Context missing");
  }

  return notificationsContext;
};

const isLinkAndRightEntityWithLinkType =
  (linkEntityTypeId: VersionedUrl) =>
  ({ linkEntity }: LinkEntityAndRightEntity) =>
    linkEntity[0] && linkEntity[0].metadata.entityTypeId === linkEntityTypeId;

export const NotificationsContextProvider: FunctionComponent<
  PropsWithChildren
> = ({ children }) => {
  const { authenticatedUser } = useAuthInfo();

  const {
    data: notificationsData,
    loading,
    refetch: refetchQuery,
  } = useQuery<
    StructuralQueryEntitiesQuery,
    StructuralQueryEntitiesQueryVariables
  >(structuralQueryEntitiesQuery, {
    variables: {
      includePermissions: false,
      query: {
        filter: {
          all: [
            {
              equal: [
                { path: ["ownedById"] },
                { parameter: authenticatedUser?.accountId },
              ],
            },
            generateVersionedUrlMatchingFilter(
              types.entityType.notification.entityTypeId,
              { ignoreParents: false },
            ),
            {
              any: [
                {
                  equal: [
                    {
                      path: [
                        "properties",
                        extractBaseUrl(
                          types.propertyType.archived.propertyTypeId,
                        ),
                      ],
                    },
                    // @ts-expect-error -- We need to update the type definition of `EntityStructuralQuery` to allow for this
                    null,
                  ],
                },
                {
                  equal: [
                    {
                      path: [
                        "properties",
                        extractBaseUrl(
                          types.propertyType.archived.propertyTypeId,
                        ),
                      ],
                    },
                    { parameter: false },
                  ],
                },
              ],
            },
          ],
        },
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          isOfType: { outgoing: 1 },
          // Retrieve the outgoing linked entities of the notification entity at depth 1
          hasLeftEntity: { outgoing: 0, incoming: 1 },
          hasRightEntity: { outgoing: 1, incoming: 0 },
        },
        temporalAxes: currentTimeInstantTemporalAxes,
      },
    },
    skip: !authenticatedUser,
    fetchPolicy: "cache-and-network",
  });

  const notifications = useMemo<Notification[] | undefined>(() => {
    if (!notificationsData) {
      return undefined;
    }

    const subgraph = mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
      notificationsData.structuralQueryEntities.subgraph,
    );

    return getRoots(subgraph).map((entity) => {
      const {
        metadata: {
          entityTypeId,
          recordId: { entityId },
        },
      } = entity;

      const outgoingLinks = getOutgoingLinkAndTargetEntities(
        subgraph,
        entityId,
      );

      if (entityTypeId === types.entityType.mentionNotification.entityTypeId) {
        const occurredInPage = outgoingLinks.find(
          isLinkAndRightEntityWithLinkType(
            types.linkEntityType.occurredInEntity.linkEntityTypeId,
          ),
        )?.rightEntity[0];

        const occurredInText = outgoingLinks.find(
          isLinkAndRightEntityWithLinkType(
            types.linkEntityType.occurredInText.linkEntityTypeId,
          ),
        )?.rightEntity[0];

        const triggeredByUserEntity = outgoingLinks.find(
          isLinkAndRightEntityWithLinkType(
            types.linkEntityType.triggeredByUser.linkEntityTypeId,
          ),
        )?.rightEntity[0];

        if (!occurredInPage || !occurredInText || !triggeredByUserEntity) {
          throw new Error(
            `Mention notification "${entityId}" is missing required links`,
          );
        }

        const triggeredByUser = constructMinimalUser({
          userEntity: triggeredByUserEntity as Entity<UserProperties>,
        });

        const occurredInComment = outgoingLinks.find(
          isLinkAndRightEntityWithLinkType(
            types.linkEntityType.occurredInComment.linkEntityTypeId,
          ),
        )?.rightEntity[0];

        if (occurredInComment) {
          return {
            kind: "comment-mention",
            entity,
            occurredInPage: occurredInPage as Entity<PageProperties>,
            occurredInText: occurredInText as Entity<TextProperties>,
            triggeredByUser,
            occurredInComment: occurredInComment as Entity<CommentProperties>,
          } satisfies CommentMentionNotification;
        }

        return {
          kind: "page-mention",
          entity,
          occurredInPage: occurredInPage as Entity<PageProperties>,
          occurredInText: occurredInText as Entity<TextProperties>,
          triggeredByUser,
        } satisfies PageMentionNotification;
      } else if (
        entityTypeId === types.entityType.commentNotification.entityTypeId
      ) {
        const occurredInPage = outgoingLinks.find(
          isLinkAndRightEntityWithLinkType(
            types.linkEntityType.occurredInEntity.linkEntityTypeId,
          ),
        )?.rightEntity[0];

        const triggeredByComment = outgoingLinks.find(
          isLinkAndRightEntityWithLinkType(
            types.linkEntityType.triggeredByComment.linkEntityTypeId,
          ),
        )?.rightEntity[0];

        const triggeredByUserEntity = outgoingLinks.find(
          isLinkAndRightEntityWithLinkType(
            types.linkEntityType.triggeredByUser.linkEntityTypeId,
          ),
        )?.rightEntity[0];

        if (!occurredInPage || !triggeredByComment || !triggeredByUserEntity) {
          throw new Error(
            `Comment notification "${entityId}" is missing required links`,
          );
        }

        const triggeredByUser = constructMinimalUser({
          userEntity: triggeredByUserEntity as Entity<UserProperties>,
        });

        const repliedToComment = outgoingLinks.find(
          isLinkAndRightEntityWithLinkType(
            types.linkEntityType.repliedToComment.linkEntityTypeId,
          ),
        )?.rightEntity[0];

        if (repliedToComment) {
          return {
            kind: "comment-reply",
            entity,
            occurredInPage: occurredInPage as Entity<PageProperties>,
            triggeredByComment,
            repliedToComment,
            triggeredByUser,
          } satisfies CommentReplyNotification;
        }

        return {
          kind: "new-comment",
          entity,
          occurredInPage: occurredInPage as Entity<PageProperties>,
          triggeredByComment,
          triggeredByUser,
        } satisfies NewCommentNotification;
      }

      throw new Error(`Notification of type "${entityTypeId}" not handled`);
    });
  }, [notificationsData]);

  const refetch = useCallback(async () => {
    await refetchQuery();
  }, [refetchQuery]);

  const value = useMemo<NotificationsContextValues>(
    () => ({
      notifications,
      loading,
      refetch,
    }),
    [notifications, loading, refetch],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
};
