import { useState, FunctionComponent } from "react";
import { Box, popoverClasses } from "@mui/material";
import { Popover } from "@hashintel/hash-design-system/popover";
import { HashBlockMeta } from "@hashintel/hash-shared/blocks";
import type { BlockVariant } from "@blockprotocol/core";
import { PlusBoxOutlineIcon } from "../../shared/icons/plus-box-outline-icon";
import { BlockSuggester } from "./createSuggester/BlockSuggester";

type InsertBlockProps = {
  onBlockSuggesterChange: (
    variant: BlockVariant,
    blockMeta: HashBlockMeta,
  ) => void;
};

export const InsertBlock: FunctionComponent<InsertBlockProps> = ({
  onBlockSuggesterChange,
}) => {
  const [contextMenu, setContextMenu] = useState<{
    left: number;
    top: number;
  } | null>(null);

  const onCloseSuggester = () => setContextMenu(null);

  const onChange = (variant: BlockVariant, blockMeta: HashBlockMeta) => {
    onBlockSuggesterChange(variant, blockMeta);
    onCloseSuggester();
  };

  return (
    <>
      <Box
        onClick={({ clientX, clientY }) => {
          setContextMenu(
            contextMenu === null
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
          opacity: contextMenu !== null ? 1 : 0,
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
        <PlusBoxOutlineIcon sx={{ position: "absolute" }} />
      </Box>

      <Popover
        open={contextMenu !== null}
        onClose={onCloseSuggester}
        anchorReference="anchorPosition"
        anchorPosition={contextMenu ?? undefined}
        sx={{
          [`& .${popoverClasses.paper}`]: {
            width: 340,
            height: 400,
            overflow: "visible",
          },
        }}
      >
        <BlockSuggester onChange={onChange} />
      </Popover>
    </>
  );
};
