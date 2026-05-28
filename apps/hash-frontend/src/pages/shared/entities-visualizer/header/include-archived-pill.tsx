import { Box, chipClasses } from "@mui/material";

import { Chip, IconButton, XMarkRegularIcon } from "@hashintel/design-system";

import { BoxArchiveIcon } from "../../../../shared/icons/box-archive-icon";

import type { FunctionComponent } from "react";

type IncludeArchivedPillProps = {
  onRemove: () => void;
};

export const IncludeArchivedPill: FunctionComponent<
  IncludeArchivedPillProps
> = ({ onRemove }) => {
  return (
    <Box>
      <Chip
        icon={
          <BoxArchiveIcon
            sx={{ fill: ({ palette }) => palette.primary.main }}
          />
        }
        label={
          <Box
            component="span"
            display="inline-flex"
            alignItems="center"
            gap={0.6}
          >
            Include archived
            <IconButton
              size="small"
              onClick={onRemove}
              aria-label="Remove include archived filter"
              sx={{
                p: 0,
                ml: 0.2,
                color: ({ palette }) => palette.gray[60],
                "&:hover": {
                  color: ({ palette }) => palette.gray[90],
                  background: "transparent",
                },
              }}
            >
              <XMarkRegularIcon sx={{ fontSize: 12 }} />
            </IconButton>
          </Box>
        }
        sx={{
          height: 24,
          border: ({ palette }) => `1px solid ${palette.gray[30]}`,
          background: ({ palette }) => palette.gray[5],
          [`.${chipClasses.label}`]: {
            color: ({ palette }) => palette.gray[70],
            fontSize: 13,
            fontWeight: 500,
          },
        }}
      />
    </Box>
  );
};
