import { TextToken } from "@local/hash-graphql-shared/graphql/types";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { TextProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import {
  Entity,
  EntityId,
  extractEntityUuidFromEntityId,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";

import { EntityTypeMismatchError } from "../../../lib/error";
import { ImpureGraphFunction, PureGraphFunction } from "../../context-types";
import { getEntities, getLatestEntityById } from "../primitive/entity";
import { isEntityLinkEntity } from "../primitive/link-entity";
import { Block, getBlockById } from "./block";
import { Comment, getCommentById } from "./comment";
import { getPageFromEntity, Page } from "./page";
import { getUserById, User } from "./user";

export type Text = {
  textualContent: TextToken[];
  entity: Entity<TextProperties>;
};

export const isEntityTextEntity = (
  entity: Entity,
): entity is Entity<TextProperties> =>
  entity.metadata.entityTypeId === systemTypes.entityType.text.entityTypeId;

export const getTextFromEntity: PureGraphFunction<{ entity: Entity }, Text> = ({
  entity,
}) => {
  if (!isEntityTextEntity(entity)) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      systemTypes.entityType.text.entityTypeId,
      entity.metadata.entityTypeId,
    );
  }

  const { textualContent } = simplifyProperties(entity.properties);

  return { entity, textualContent: textualContent as TextToken[] };
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
              systemTypes.linkEntityType.hasData.linkEntityTypeId,
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
              systemTypes.linkEntityType.hasData.linkEntityTypeId,
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
            systemTypes.linkEntityType.contains.linkEntityTypeId,
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
            systemTypes.entityType.page.entityTypeId,
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
            systemTypes.linkEntityType.hasText.linkEntityTypeId,
            { ignoreParents: true },
          ),
          {
            equal: [
              { path: ["rightEntity", "uuid"] },
              { parameter: textEntityUuid },
            ],
          },
          generateVersionedUrlMatchingFilter(
            systemTypes.entityType.comment.entityTypeId,
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
