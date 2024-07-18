import { EntityTypeMismatchError } from "@local/hash-backend-utils/error";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  contentLinkTypeFilter,
  pageEntityTypeFilter,
} from "@local/hash-isomorphic-utils/page-entity-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { Text as TextEntity } from "@local/hash-isomorphic-utils/system-types/shared";
import type { TextToken } from "@local/hash-isomorphic-utils/types";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";

import type {
  ImpureGraphFunction,
  PureGraphFunction,
} from "../../context-types";
import { getEntities, getLatestEntityById } from "../primitive/entity";
import { isEntityLinkEntity } from "../primitive/link-entity";
import type { Block } from "./block";
import { getBlockById } from "./block";
import type { Comment } from "./comment";
import { getCommentById } from "./comment";
import type { Page } from "./page";
import { getPageFromEntity } from "./page";
import type { User } from "./user";
import { getUserById } from "./user";

export type Text = {
  textualContent: TextToken[];
  entity: Entity<TextEntity>;
};

function assertTextEntity(
  entity: Entity,
): asserts entity is Entity<TextEntity> {
  if (entity.metadata.entityTypeId !== systemEntityTypes.text.entityTypeId) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      systemEntityTypes.text.entityTypeId,
      entity.metadata.entityTypeId,
    );
  }
}

export const getTextFromEntity: PureGraphFunction<{ entity: Entity }, Text> = ({
  entity,
}) => {
  assertTextEntity(entity);

  const { textualContent } = simplifyProperties(entity.properties);

  return {
    entity,
    textualContent: Array.isArray(textualContent)
      ? (textualContent as TextToken[])
      : [{ tokenType: "text", text: textualContent } satisfies TextToken],
  };
};

/**
 * Get a system text entity by its entity id.
 *
 * @param params.entityId - the entity id of the text
 */
export const getTextById: ImpureGraphFunction<
  { entityId: EntityId },
  Promise<Text>
> = async (ctx, authentication, { entityId }) => {
  const entity = await getLatestEntityById(ctx, authentication, {
    entityId,
  });

  return getTextFromEntity({ entity });
};

/**
 * Get the page that contains the text, or null if the text is not in the page.
 *
 * @param params.text - the text entity
 */
export const getPageAndBlockByText: ImpureGraphFunction<
  { text: Text; includeDrafts?: boolean },
  Promise<{ page: Page; block: Block } | null>
> = async (context, authentication, params) => {
  const { text, includeDrafts = false } = params;

  const textEntityUuid = extractEntityUuidFromEntityId(
    text.entity.metadata.recordId.entityId,
  );

  const [
    matchingBlockDataLinksWithTextAtDepthOne,
    matchingBlockDataLinksWithTextAtDepthTwo,
  ] = await Promise.all([
    getEntities(context, authentication, {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(
            systemLinkEntityTypes.hasData.linkEntityTypeId,
            { ignoreParents: true },
          ),
          {
            equal: [
              { path: ["rightEntity", "uuid"] },
              { parameter: textEntityUuid },
            ],
          },
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts,
    }).then((entities) => entities.filter(isEntityLinkEntity)),
    getEntities(context, authentication, {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(
            systemLinkEntityTypes.hasData.linkEntityTypeId,
            { ignoreParents: true },
          ),
          {
            equal: [
              {
                path: ["rightEntity", "outgoingLinks", "rightEntity", "uuid"],
              },
              { parameter: textEntityUuid },
            ],
          },
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts,
    }).then((entities) => entities.filter(isEntityLinkEntity)),
  ]);

  /** @todo: unify these in a single structural query when it becomes possible */
  const matchingBlockDataLinks = [
    ...matchingBlockDataLinksWithTextAtDepthOne,
    ...matchingBlockDataLinksWithTextAtDepthTwo,
  ];

  const matchingContainsLinks = await getEntities(context, authentication, {
    filter: {
      all: [
        contentLinkTypeFilter,
        {
          any: matchingBlockDataLinks.map(({ linkData }) => ({
            equal: [
              { path: ["rightEntity", "uuid"] },
              {
                parameter: extractEntityUuidFromEntityId(linkData.leftEntityId),
              },
            ],
          })),
        },
      ],
    },
    temporalAxes: currentTimeInstantTemporalAxes,
    includeDrafts,
  }).then((entities) => entities.filter(isEntityLinkEntity));

  const pageEntities = await getEntities(context, authentication, {
    filter: {
      all: [
        pageEntityTypeFilter,
        {
          any: matchingContainsLinks.map(({ metadata }) => ({
            equal: [
              { path: ["outgoingLinks", "uuid"] },
              {
                parameter: extractEntityUuidFromEntityId(
                  metadata.recordId.entityId,
                ),
              },
            ],
          })),
        },
      ],
    },
    temporalAxes: currentTimeInstantTemporalAxes,
    includeDrafts,
  }).then((entities) =>
    entities.map((entity) => getPageFromEntity({ entity })),
  );

  const page = pageEntities[0];

  if (page) {
    const blockEntityId = matchingContainsLinks.find(
      ({ linkData }) =>
        linkData.leftEntityId === page.entity.metadata.recordId.entityId,
    )!.linkData.rightEntityId;

    const block = await getBlockById(context, authentication, {
      entityId: blockEntityId,
    });

    return { page, block };
  }
  return null;
};

/**
 * Get the comment that contains the text, or null if the text is not in a comment.
 *
 * @param params.text - the text entity
 */
export const getCommentByText: ImpureGraphFunction<
  { text: Text; includeDrafts?: boolean },
  Promise<Comment | null>
> = async (context, authentication, params) => {
  const { text, includeDrafts = false } = params;
  const textEntityUuid = extractEntityUuidFromEntityId(
    text.entity.metadata.recordId.entityId,
  );

  const matchingHasTextLinks = await getEntities(context, authentication, {
    filter: {
      all: [
        generateVersionedUrlMatchingFilter(
          systemLinkEntityTypes.hasText.linkEntityTypeId,
          { ignoreParents: true },
        ),
        {
          equal: [
            { path: ["rightEntity", "uuid"] },
            { parameter: textEntityUuid },
          ],
        },
        generateVersionedUrlMatchingFilter(
          systemEntityTypes.comment.entityTypeId,
          { ignoreParents: true, pathPrefix: ["leftEntity"] },
        ),
      ],
    },
    temporalAxes: currentTimeInstantTemporalAxes,
    includeDrafts,
  }).then((entities) => entities.filter(isEntityLinkEntity));

  if (matchingHasTextLinks.length > 1) {
    throw new Error("Text entity is in more than one comment");
  }

  const [matchingHasTextLink] = matchingHasTextLinks;

  if (matchingHasTextLink) {
    const comment = await getCommentById(context, authentication, {
      entityId: matchingHasTextLink.linkData.leftEntityId,
    });

    return comment;
  }

  return null;
};

/**
 * Get the mentioned users in textual content.
 *
 * @param params.textualContent - the textual content (array of text tokens)
 */
export const getMentionedUsersInTextualContent: ImpureGraphFunction<
  { textualContent: TextToken[] },
  Promise<User[]>
> = async (context, authentication, { textualContent }) => {
  const mentionTextualContent = textualContent.filter(
    (token): token is Extract<TextToken, { tokenType: "mention" }> =>
      token.tokenType === "mention",
  );

  const mentionedUsers = await Promise.all(
    mentionTextualContent
      .filter(({ mentionType }) => mentionType === "user")
      // Filter duplicate user mentions (users that were mentioned more than once)
      .filter(
        (mention, i, all) =>
          all.findIndex(({ entityId }) => entityId === mention.entityId) === i,
      )
      .map(({ entityId }) =>
        getUserById(context, authentication, { entityId }),
      ),
  );

  return mentionedUsers;
};
