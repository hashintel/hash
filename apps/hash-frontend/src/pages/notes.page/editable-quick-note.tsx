import { useQuery } from "@apollo/client";
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
import { Box, Fade, Typography } from "@mui/material";
import { FunctionComponent, useMemo } from "react";

import { BlockLoadedProvider } from "../../blocks/on-block-loaded";
import { UserBlocksProvider } from "../../blocks/user-blocks";
import {
  BlockCollectionContentItem,
  GetEntityQuery,
  GetEntityQueryVariables,
} from "../../graphql/api-types.gen";
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
  quickNoteEntity: Entity;
  quickNoteSubgraph: Subgraph<EntityRootType>;
}> = ({ quickNoteEntity, quickNoteSubgraph }) => {
  const { authenticatedUser } = useAuthenticatedUser();

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
      getBlockCollectionContents({
        blockCollectionEntityId,
        blockCollectionSubgraph: quickNoteSubgraph,
      }),
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

  return (
    <Box>
      <Box display="flex" columnGap={2.25}>
        <Fade in={typeof numberOfBlocks !== "undefined"}>
          <Box>
            <Statistic amount={numberOfBlocks} unit="blocks" />
          </Box>
        </Fade>
        <Fade in={typeof numberOfWords !== "undefined"}>
          <Box>
            <Statistic amount={numberOfWords} unit="words" />
          </Box>
        </Fade>
        <Fade in={typeof numberOfCharacters !== "undefined"}>
          <Box>
            <Statistic amount={numberOfCharacters} unit="characters" />
          </Box>
        </Fade>
      </Box>
      <BlockLoadedProvider>
        <UserBlocksProvider value={{}}>
          <BlockCollection
            ownedById={authenticatedUser.accountId as OwnedById}
            entityId={quickNoteEntity.metadata.recordId.entityId}
            contents={contents}
            readonly={false}
            sx={{
              paddingY: 3,
            }}
          />
        </UserBlocksProvider>
      </BlockLoadedProvider>
    </Box>
  );
};
