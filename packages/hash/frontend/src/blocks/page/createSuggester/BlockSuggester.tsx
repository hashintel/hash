import { BlockVariant } from "blockprotocol";
import { VFC } from "react";
import { tw } from "twind";
import { Box, SxProps, Theme, Typography } from "@mui/material";

import { Suggester } from "./Suggester";
import { UserBlock, useUserBlocks } from "../../userBlocks";
import { useFilteredBlocks } from "./useFilteredBlocks";
import { WarnIcon } from "../../../components/icons/WarnIcon";

export interface BlockSuggesterProps {
  search?: string;
  onChange(variant: BlockVariant, block: UserBlock): void;
  sx?: SxProps<Theme>;
}

// @todo remove this when API returns actual icon URL
export const getVariantIcon = (option: {
  variant: BlockVariant;
  meta: UserBlock;
}): string | undefined => {
  if (option.variant.icon?.startsWith("/")) {
    return `https://blockprotocol.org${option.variant.icon}`;
  }

  if (option.variant.icon?.startsWith("public/")) {
    return `https://blockprotocol.org${
      option.meta.icon!.split("public/")[0]
    }public/${option.variant.icon.split("public/")[1]}`;
  }

  return option.variant.icon;
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
      renderError={
        blockFetchFailed ? (
          <Box
            sx={({ palette }) => ({
              backgroundColor: palette.common.white,
              position: "relative",
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
                pointerEvents: "none",
              }}
            />
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                p: 1,
              }}
            >
              <Box sx={{ px: 0.75 }}>
                <WarnIcon sx={{ width: "20px", height: "20px" }} />
              </Box>
              <Box sx={{ px: 1, py: 0.5 }}>
                <Typography
                  variant="smallTextLabels"
                  sx={({ palette }) => ({
                    fontWeight: 500,
                    color: palette.gray[70],
                  })}
                >
                  Unable to load all blocks due to a network error. Please try
                  again later.
                </Typography>
              </Box>
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
