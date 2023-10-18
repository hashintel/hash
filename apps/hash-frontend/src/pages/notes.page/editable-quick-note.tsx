import { useMutation, useQuery } from "@apollo/client";
import { IconButton } from "@hashintel/design-system";
import { TextToken } from "@local/hash-graphql-shared/graphql/types";
import { getEntityQuery } from "@local/hash-graphql-shared/queries/entity.queries";
import { isHashTextBlock } from "@local/hash-isomorphic-utils/blocks";
import { zeroedGraphResolveDepths } from "@local/hash-isomorphic-utils/graph-queries";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import {
  Entity,
  EntityRootType,
  OwnedById,
  Subgraph,
} from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { Box, Fade, Skeleton, Typography } from "@mui/material";
import { FunctionComponent, useCallback, useMemo } from "react";

import {
  ArchiveEntityMutation,
  ArchiveEntityMutationVariables,
  BlockCollectionContentItem,
  GetEntityQuery,
  GetEntityQueryVariables,
} from "../../graphql/api-types.gen";
import { archiveEntityMutation } from "../../graphql/queries/knowledge/entity.queries";
import { ArchiveRegularIcon } from "../../shared/icons/achive-regular-icon";
import { NoteStickyRegularIcon } from "../../shared/icons/note-sticky-regular-icon";
import { useAuthenticatedUser } from "../shared/auth-info-context";
import { BlockCollection } from "../shared/block-collection/block-collection";
import { getBlockCollectionContents } from "../shared/get-block-collection-contents";

const Statistic: FunctionComponent<{ amount?: number; unit: string }> = ({
  amount,
  unit,
}) => (
  <Typography
    sx={{
      color: ({ palette }) => palette.gray[50],
      fontSize: 12,
      fontWeight: 600,
      textTransform: "uppercase",
      span: { color: ({ palette }) => palette.gray[70] },
    }}
  >
    <Box component="span">{amount}</Box> {unit}
    {!amount || amount === 0 || amount > 1 ? "s" : ""}
  </Typography>
);

const parseTextFromTextBlock = ({
  rightEntity,
}: BlockCollectionContentItem) => {
  if (
    rightEntity.blockChildEntity.metadata.entityTypeId ===
    types.entityType.text.entityTypeId
  ) {
    const textTokens = rightEntity.blockChildEntity.properties[
      extractBaseUrl(types.propertyType.tokens.propertyTypeId)
    ] as TextToken[];

    return textTokens.reduce(
      (prevText, current) =>
        current.tokenType === "text" ? `${prevText}${current.text}` : prevText,
      "",
    );
  }

  return "";
};

export const EditableQuickNote: FunctionComponent<{
  displayLabel?: boolean;
  displayActionButtons?: boolean;
  quickNoteEntity: Entity;
  quickNoteSubgraph?: Subgraph<EntityRootType>;
  refetchQuickNotes?: () => Promise<void>;
}> = ({
  displayLabel = true,
  displayActionButtons = true,
  quickNoteEntity,
  quickNoteSubgraph,
  refetchQuickNotes,
}) => {
  const { authenticatedUser } = useAuthenticatedUser();

  const [archiveEntity] = useMutation<
    ArchiveEntityMutation,
    ArchiveEntityMutationVariables
  >(archiveEntityMutation, { onCompleted: refetchQuickNotes });

  const blockCollectionEntityId = quickNoteEntity.metadata.recordId.entityId;

  const { data } = useQuery<GetEntityQuery, GetEntityQueryVariables>(
    getEntityQuery,
    {
      variables: {
        entityId: blockCollectionEntityId,
        ...zeroedGraphResolveDepths,
        hasLeftEntity: { incoming: 2, outgoing: 2 },
        hasRightEntity: { incoming: 2, outgoing: 2 },
      },
      fetchPolicy: "cache-and-network",
    },
  );

  const mostRecentContents = useMemo(
    () =>
      data?.getEntity
        ? getBlockCollectionContents({
            blockCollectionEntityId,
            blockCollectionSubgraph: data.getEntity as Subgraph<EntityRootType>,
          })
        : undefined,
    [blockCollectionEntityId, data],
  );

  const contents = useMemo(
    () =>
      quickNoteSubgraph
        ? getBlockCollectionContents({
            blockCollectionEntityId,
            blockCollectionSubgraph: quickNoteSubgraph,
          })
        : undefined,
    [blockCollectionEntityId, quickNoteSubgraph],
  );

  const numberOfBlocks = useMemo(
    () => (mostRecentContents ? mostRecentContents.length : undefined),
    [mostRecentContents],
  );

  const textBlocks = useMemo(
    () =>
      mostRecentContents?.filter(({ rightEntity }) =>
        isHashTextBlock(rightEntity.componentId),
      ),
    [mostRecentContents],
  );

  const text = useMemo(
    () =>
      textBlocks?.reduce((prev, textBlock) => {
        const parsedText = parseTextFromTextBlock(textBlock);
        return `${prev}${prev.length > 0 ? " " : ""}${parsedText}`;
      }, ""),
    [textBlocks],
  );

  const numberOfWords = useMemo(
    () =>
      // Use a regex to match sequences of non-whitespace characters.
      // This will treat words like "can't" as a single word and ignore multiple spaces or other delimiters.
      text?.match(/\S+/g)?.length,
    [text],
  );

  const numberOfCharacters = useMemo(() => {
    if (!text || text === "") {
      return undefined;
    }
    const noWhitespace = text.replace(/\s+/g, ""); // Remove all whitespace characters
    const surrogatePairs =
      noWhitespace.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g) ?? [];
    return noWhitespace.length - surrogatePairs.length;
  }, [text]);

  const handleArchive = useCallback(async () => {
    await archiveEntity({ variables: { entityId: blockCollectionEntityId } });
  }, [archiveEntity, blockCollectionEntityId]);

  return (
    <Box>
      <Box display="flex" justifyContent="space-between">
        <Box display="flex" columnGap={2.25}>
          {displayLabel ? (
            <Typography
              sx={{
                color: ({ palette }) => palette.gray[70],
                fontSize: 12,
                fontWeight: 600,
                textTransform: "uppercase",
              }}
            >
              <NoteStickyRegularIcon
                sx={{
                  fontSize: 12,
                  marginRight: 0.75,
                  position: "relative",
                  top: 2,
                }}
              />
              Note
            </Typography>
          ) : null}
          <Fade in={typeof numberOfBlocks !== "undefined"}>
            <Box>
              <Statistic amount={numberOfBlocks} unit="block" />
            </Box>
          </Fade>
          <Fade in={typeof numberOfWords !== "undefined"}>
            <Box>
              <Statistic amount={numberOfWords} unit="word" />
            </Box>
          </Fade>
          <Fade in={typeof numberOfCharacters !== "undefined"}>
            <Box>
              <Statistic amount={numberOfCharacters} unit="character" />
            </Box>
          </Fade>
        </Box>
        {displayActionButtons ? (
          <Box>
            <IconButton onClick={handleArchive}>
              <ArchiveRegularIcon />
            </IconButton>
          </Box>
        ) : null}
      </Box>
      {contents ? (
        <BlockCollection
          ownedById={authenticatedUser.accountId as OwnedById}
          entityId={quickNoteEntity.metadata.recordId.entityId}
          contents={contents}
          readonly={false}
          sx={{ paddingY: 3 }}
        />
      ) : (
        <Skeleton />
      )}
    </Box>
  );
};
