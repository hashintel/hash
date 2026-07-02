import { Box } from "@mui/material";

import { Chip, IconButton, XMarkRegularIcon } from "@hashintel/design-system";
import { formatNumber } from "@local/hash-isomorphic-utils/format-number";

import { ChartNetworkRegularIcon } from "../../../../shared/icons/chart-network-regular-icon";
import { activePillSx } from "./pill-styles";

import type { FunctionComponent } from "react";

type FrontierAdditionsPillProps = {
  /** How many entities graph exploration has OR-ed into the displayed set. */
  count: number;
  onRemove: () => void;
};

/**
 * Shows the entities pulled in by expanding frontier nodes in the graph view:
 * they match no filter, they are OR-ed into the displayed set on top of the
 * filtered results. Removing the pill drops them again (the graph resets to
 * the filtered set).
 */
export const FrontierAdditionsPill: FunctionComponent<
  FrontierAdditionsPillProps
> = ({ count, onRemove }) => {
  return (
    <Box>
      <Chip
        icon={
          <ChartNetworkRegularIcon
            sx={{ fill: ({ palette }) => palette.blue[70], fontSize: 14 }}
          />
        }
        label={
          <Box
            component="span"
            sx={{ display: "inline-flex", alignItems: "center", gap: 0.6 }}
          >
            {`OR ${formatNumber(count)} ${count === 1 ? "entity" : "entities"}`}
            <IconButton
              size="small"
              onClick={onRemove}
              aria-label="Remove entities added from the graph"
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
