import { Box, Tooltip } from "@mui/material";

import { Chip, HashInlineIcon } from "@hashintel/design-system";
import { GRID_CLICK_IGNORE_CLASS } from "@hashintel/design-system/constants";

import type { HashIconDefinition } from "@hashintel/design-system";
import type { ReactNode } from "react";

const faAsterisk = { icon: "asterisk" } as const;

export const ValueChip = ({
  title,
  icon = faAsterisk,
  imageSrc,
  selected,
  tooltip = "",
}: {
  title: ReactNode;
  icon?: Pick<HashIconDefinition, "icon">;
  imageSrc?: string;
  selected: boolean;
  tooltip?: string;
}) => {
  return (
    <Chip
      sx={[
        {
          minWidth: 0,
          background: "white",
          borderColor: selected ? "blue.70" : "gray.20",
          svg: {
            color: ({ palette }) => `${palette.blue[70]} !important`,
          },
        },
      ]}
      icon={
        imageSrc ? (
          <Box
            component="img"
            src={imageSrc}
            sx={{
              borderRadius: 1,
              height: 25,
              width: "auto",
              objectFit: "contain",
              maxWidth: 80,
            }}
          />
        ) : (
          <Tooltip
            title={tooltip}
            placement="top"
            PopperProps={{
              // this className prevents editor overlay from closing
              className: GRID_CLICK_IGNORE_CLASS,
            }}
            disableInteractive
          >
            <HashInlineIcon
              icon={icon}
              sx={{
                /**
                 * used zIndex:1, otherwise label of the chip is rendered over icon with transparent background,
                 * which prevents tooltip from opening
                 */
                zIndex: 1,
              }}
            />
          </Tooltip>
        )
      }
      label={title}
    />
  );
};
