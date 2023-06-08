import type { BlockVariant } from "@blockprotocol/core";
import { HashBlockMeta } from "@local/hash-isomorphic-utils/blocks";
import { Box, Popover, popoverClasses } from "@mui/material";
import { FunctionComponent, useState } from "react";

import { PlusBoxOutlineIcon } from "../../shared/icons/plus-box-outline-icon";
import { BlockSuggester } from "./create-suggester/block-suggester";

type InsertBlockProps = {
  readonly: boolean;
  onBlockSuggesterChange: (
    variant: BlockVariant,
    blockMeta: HashBlockMeta,
  ) => void;
};

export const InsertBlock: FunctionComponent<InsertBlockProps> = ({
  onBlockSuggesterChange,
  readonly,
}) => {
  const [contextMenuPosition, setContextMenuPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

  const onCloseSuggester = () => setContextMenuPosition(null);

  const onChange = (variant: BlockVariant, blockMeta: HashBlockMeta) => {
    onBlockSuggesterChange(variant, blockMeta);
    onCloseSuggester();
  };

  if (readonly) {
    return null;
  }

  return (
    <>
      <Box
        onClick={({ clientX, clientY }) => {
          setContextMenuPosition(
            contextMenuPosition === null
              ? {
                  left: clientX,
                  top: clientY,
                }
              : null,
          );
        }}
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          opacity: contextMenuPosition !== null ? 1 : 0,
          height: 30,
          cursor: "pointer",
          transition: ({ transitions }) => transitions.create("opacity"),
          "&:hover": {
            opacity: 1,
          },
        }}
      >
        <Box
          sx={{
            width: 1,
            height: "1px",
            background:
              "linear-gradient(90deg, #DDE7F0 41.42%, #FFFFFF 50.26%, #DDE7F0 59.11%)",
          }}
        />
        <PlusBoxOutlineIcon
          sx={{
            color: ({ palette }) => palette.gray[40],
            position: "absolute",
          }}
        />
      </Box>

      <Popover
        open={contextMenuPosition !== null}
        onClose={onCloseSuggester}
        anchorReference="anchorPosition"
        anchorPosition={contextMenuPosition ?? undefined}
        sx={{
          [`& .${popoverClasses.paper}`]: {
            width: 340,
            height: 400,
            overflow: "visible",
          },
        }}
        disableRestoreFocus
      >
        <BlockSuggester onChange={onChange} />
      </Popover>
    </>
  );
};
