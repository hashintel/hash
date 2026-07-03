import { Stack, Typography } from "@mui/material";

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
 * Shows the entities pulled in by expanding frontier nodes in the graph view.
 * The filter pills before it AND together; these entities match no filter, so
 * a plain-typography "OR" joins the pill onto the ribbon, reading as "filters
 * OR these n entities". Removing the pill drops them again (the graph resets
 * to the filtered set).
 */
export const FrontierAdditionsPill: FunctionComponent<
  FrontierAdditionsPillProps
> = ({ count, onRemove }) => {
  return (
    <Stack direction="row" alignItems="center" gap={1}>
      <Typography
        component="span"
        sx={{
          color: ({ palette }) => palette.gray[60],
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        OR
      </Typography>
      <Chip
        icon={
          <ChartNetworkRegularIcon
            sx={{ fill: ({ palette }) => palette.blue[70], fontSize: 14 }}
          />
        }
        label={
          <Stack component="span" direction="row" alignItems="center" gap={0.6}>
            {`${formatNumber(count)} ${count === 1 ? "entity" : "entities"}`}
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
          </Stack>
        }
        sx={activePillSx}
      />
    </Stack>
  );
};
