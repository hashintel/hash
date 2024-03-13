import type { BlockVariant } from "@blockprotocol/core";
import type { HashBlockMeta } from "@local/hash-isomorphic-utils/blocks";
import type { SxProps, Theme } from "@mui/material";
import { Box, Typography } from "@mui/material";
import type { FunctionComponent } from "react";
import { useMemo } from "react";

import { useUserBlocks } from "../../../../blocks/user-blocks";
import { WarnIcon } from "../../../../shared/icons";
import { useFilteredBlocks } from "../shared/use-filtered-blocks";
import { Suggester } from "./suggester";

export interface BlockSuggesterProps {
  search?: string;
  onChange(variant: BlockVariant, blockMeta: HashBlockMeta): void;
  sx?: SxProps<Theme>;
}

/**
 * used to present list of blocks to choose from to the user
 *
 * @todo highlight variant of the prosemirror-node this suggester is attached to.
 */
export const BlockSuggester: FunctionComponent<BlockSuggesterProps> = ({
  search = "",
  onChange,
  sx,
}) => {
  const { value: blocksMap, blockFetchFailed } = useUserBlocks();

  const blocksArray = useMemo(
    () => Array.from(Object.values(blocksMap)),
    [blocksMap],
  );
  const filteredBlocks = useFilteredBlocks(search, blocksArray);

  return (
    <Suggester
      options={filteredBlocks}
      renderItem={(option) => (
        <>
          <div
            style={{
              alignItems: "center",
              display: "flex",
              justifyContent: "center",
              width: "4rem",
            }}
          >
            {option.variant.icon && (
              <img
                style={{
                  height: "1.5rem",
                  width: "1.5rem",
                }}
                alt={option.variant.name}
                src={option.variant.icon ?? "/format-font.svg"}
              />
            )}
          </div>
          <div
            style={{
              flex: "1 1 0%",
              paddingBottom: "0.75rem",
              paddingRight: "0.5rem",
              paddingTop: "0.75rem",
            }}
          >
            <p
              style={{
                fontSize: "0.875rem",
                fontWeight: "700",
                lineHeight: "1.25rem",
              }}
            >
              {option.variant.name}
            </p>
            <p
              style={{
                color: "#000000",
                fontSize: "0.75rem",
                lineHeight: "1rem",
                opacity: 0.6,
              }}
            >
              {option.variant.description}
            </p>
          </div>
        </>
      )}
      error={
        blockFetchFailed ? (
          <Box
            sx={({ palette }) => ({
              backgroundColor: palette.common.white,
              position: "relative",
              display: "flex",
              alignItems: "center",
              p: 1,
            })}
          >
            <Box
              sx={{
                background:
                  "linear-gradient(0deg, rgba(193, 207, 222, 0.36) -5%, rgba(255, 255, 255, 0) 50%)",
                height: "40px",
                width: "100%",
                position: "absolute",
                top: "-40px",
                left: "0px",
                pointerEvents: "none",
              }}
            />
            <Box sx={{ px: 0.75 }}>
              <WarnIcon sx={{ width: "20px", height: "20px" }} />
            </Box>
            <Box sx={{ px: 1, py: 0.5 }}>
              <Typography
                variant="smallTextLabels"
                sx={({ palette }) => ({
                  fontWeight: 500,
                  color: palette.gray[70],
                  wordBreak: "normal",
                })}
              >
                Unable to load all blocks due to a network error. Please try
                again later.
              </Typography>
            </Box>
          </Box>
        ) : null
      }
      itemKey={({ meta, variant }) => `${meta.componentId}/${variant.name}`}
      onChange={(option) => {
        onChange(option.variant, option.meta);
      }}
      sx={sx}
    />
  );
};
