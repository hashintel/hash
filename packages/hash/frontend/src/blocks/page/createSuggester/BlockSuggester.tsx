import { BlockVariant } from "blockprotocol";
import { VFC } from "react";
import { tw } from "twind";
import { Box, SxProps, Theme, Typography } from "@mui/material";

import { Suggester } from "./Suggester";
import { RemoteBlockMetadata, useUserBlocks } from "../../userBlocks";
import { useFilteredBlocks } from "./useFilteredBlocks";
import { WarnIcon } from "../../../shared/icons";

export interface BlockSuggesterProps {
  search?: string;
  onChange(variant: BlockVariant, block: RemoteBlockMetadata): void;
  sx?: SxProps<Theme>;
}

export const getVariantIcon = (option: {
  variant: BlockVariant;
  meta: RemoteBlockMetadata;
}): string | undefined => {
  const iconPath = option.variant.icon;

  const regex = /^(?:[a-z]+:)?\/\//i;
  if (!iconPath || regex.test(iconPath)) {
    return iconPath;
  }

  return `${option.meta.componentId}/${iconPath.replace(/^\//, "")}`;
};

/**
 * used to present list of blocks to choose from to the user
 *
 * @todo highlight variant of the prosemirror-node this suggester is attached to.
 */
export const BlockSuggester: VFC<BlockSuggesterProps> = ({
  search = "",
  onChange,
  sx,
}) => {
  const { value: userBlocks, blockFetchFailed } = useUserBlocks();

  const filteredBlocks = useFilteredBlocks(search, userBlocks);

  return (
    <Suggester
      options={filteredBlocks}
      renderItem={(option) => (
        <>
          <div className={tw`flex w-16 items-center justify-center`}>
            {option?.variant.icon && (
              <img
                className={tw`w-6 h-6`}
                alt={option.variant.name}
                src={getVariantIcon(option)}
              />
            )}
          </div>
          <div className={tw`py-3 flex-1 pr-2`}>
            <p className={tw`text-sm font-bold`}>{option?.variant.name}</p>
            <p className={tw`text-xs text-opacity-60 text-black`}>
              {option?.variant.description}
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
      itemKey={({ meta, variant }) => `${meta.name}/${variant.name}`}
      onChange={(option) => {
        onChange(option.variant, option.meta);
      }}
      sx={sx}
    />
  );
};
