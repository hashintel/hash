import { TextToken } from "@local/hash-graphql-shared/graphql/types";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { TextProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import {
  Entity,
  EntityId,
  extractEntityUuidFromEntityId,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";

import { EntityTypeMismatchError } from "../../../lib/error";
import { ImpureGraphFunction, PureGraphFunction } from "../..";
import { SYSTEM_TYPES } from "../../system-types";
import { getEntities, getLatestEntityById } from "../primitive/entity";
import { isEntityLinkEntity } from "../primitive/link-entity";
import { Block, getBlockById } from "./block";
import { Comment, getCommentById } from "./comment";
import { getPageFromEntity, Page } from "./page";
import { getUserById, User } from "./user";

export type Text = {
  tokens: TextToken[];
  entity: Entity<TextProperties>;
};

export const isEntityTextEntity = (
  entity: Entity,
): entity is Entity<TextProperties> =>
  entity.metadata.entityTypeId === SYSTEM_TYPES.entityType.text.schema.$id;

export const getTextFromEntity: PureGraphFunction<{ entity: Entity }, Text> = ({
  entity,
}) => {
  if (!isEntityTextEntity(entity)) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      SYSTEM_TYPES.entityType.text.schema.$id,
      entity.metadata.entityTypeId,
    );
  }

  const { tokens } = simplifyProperties(entity.properties);

  return { entity, tokens: tokens as TextToken[] };
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
  { text: Text },
  Promise<{ page: Page; block: Block } | null>
> = async (context, authentication, { text }) => {
  const textEntityUuid = extractEntityUuidFromEntityId(
    text.entity.metadata.recordId.entityId,
  );

  const [
    matchingBlockDataLinksWithTextAtDepthOne,
    matchingBlockDataLinksWithTextAtDepthTwo,
  ] = await Promise.all([
    getEntities(context, authentication, {
      query: {
        filter: {
          all: [
            generateVersionedUrlMatchingFilter(
              SYSTEM_TYPES.linkEntityType.blockData.schema.$id,
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
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: currentTimeInstantTemporalAxes,
      },
    }).then((subgraph) => getRoots(subgraph).filter(isEntityLinkEntity)),
    getEntities(context, authentication, {
      query: {
        filter: {
          all: [
            generateVersionedUrlMatchingFilter(
              SYSTEM_TYPES.linkEntityType.blockData.schema.$id,
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
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: currentTimeInstantTemporalAxes,
      },
    }).then((subgraph) => getRoots(subgraph).filter(isEntityLinkEntity)),
  ]);

  /** @todo: unify these in a single structural query when it becomes possible */
  const matchingBlockDataLinks = [
    ...matchingBlockDataLinksWithTextAtDepthOne,
    ...matchingBlockDataLinksWithTextAtDepthTwo,
  ];

  const matchingContainsLinks = await getEntities(context, authentication, {
    query: {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(
            SYSTEM_TYPES.linkEntityType.contains.schema.$id,
            { ignoreParents: true },
          ),
          {
            any: matchingBlockDataLinks.map(({ linkData }) => ({
              equal: [
                { path: ["rightEntity", "uuid"] },
                {
                  parameter: extractEntityUuidFromEntityId(
                    linkData.leftEntityId,
                  ),
                },
              ],
            })),
          },
        ],
      },
      graphResolveDepths: zeroedGraphResolveDepths,
      temporalAxes: currentTimeInstantTemporalAxes,
    },
  }).then((subgraph) => getRoots(subgraph).filter(isEntityLinkEntity));

  const pageEntities = await getEntities(context, authentication, {
    query: {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(
            SYSTEM_TYPES.entityType.page.schema.$id,
            { ignoreParents: true },
          ),
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
      graphResolveDepths: zeroedGraphResolveDepths,
      temporalAxes: currentTimeInstantTemporalAxes,
    },
  }).then((subgraph) =>
    getRoots(subgraph).map((entity) => getPageFromEntity({ entity })),
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
  { text: Text },
  Promise<Comment | null>
> = async (context, authentication, { text }) => {
  const textEntityUuid = extractEntityUuidFromEntityId(
    text.entity.metadata.recordId.entityId,
  );

  const matchingHasTextLinks = await getEntities(context, authentication, {
    query: {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(
            SYSTEM_TYPES.linkEntityType.hasText.schema.$id,
            { ignoreParents: true },
          ),
          {
            equal: [
              { path: ["rightEntity", "uuid"] },
              { parameter: textEntityUuid },
            ],
          },
          generateVersionedUrlMatchingFilter(
            SYSTEM_TYPES.entityType.comment.schema.$id,
            { ignoreParents: true, pathPrefix: ["leftEntity"] },
          ),
        ],
      },
      graphResolveDepths: zeroedGraphResolveDepths,
      temporalAxes: currentTimeInstantTemporalAxes,
    },
  }).then((subgraph) => getRoots(subgraph).filter(isEntityLinkEntity));

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
 * Get the mentioned users in text tokens.
 *
 * @param params.tokens - the array of text tokens
 */
export const getMentionedUsersInTextTokens: ImpureGraphFunction<
  { tokens: TextToken[] },
  Promise<User[]>
> = async (context, authentication, { tokens }) => {
  const mentionTokens = tokens.filter(
    (token): token is Extract<TextToken, { tokenType: "mention" }> =>
      token.tokenType === "mention",
  );

  const mentionedUsers = await Promise.all(
    mentionTokens
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
