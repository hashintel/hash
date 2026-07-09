import { Box } from "@mui/material";

import { Chip, IconButton, XMarkRegularIcon } from "@hashintel/design-system";

import { BoxArchiveIcon } from "../../../../shared/icons/box-archive-icon";
import { activePillSx } from "./pill-styles";

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
          <BoxArchiveIcon sx={{ fill: ({ palette }) => palette.blue[70] }} />
        }
        label={
          <Box
            component="span"
            sx={{ display: "inline-flex", alignItems: "center", gap: 0.6 }}
          >
            Include archived
            <IconButton
              size="small"
              onClick={onRemove}
              aria-label="Remove include archived filter"
              sx={{
                p: 0,
                ml: 0.2,
                color: ({ palette }) => palette.blue[70],
                "&:hover": {
                  color: ({ palette }) => palette.blue[90],
                  background: "transparent",
                },
              }}
            >
              <XMarkRegularIcon />
            </IconButton>
          </Box>
        }
        sx={activePillSx}
      />
    </Box>
  );
};
