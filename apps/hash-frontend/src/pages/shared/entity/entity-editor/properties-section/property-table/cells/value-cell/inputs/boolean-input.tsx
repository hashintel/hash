import { Box, chipClasses, Tooltip, Typography } from "@mui/material";

import { Chip, HashInlineIcon } from "@hashintel/design-system";
import { GRID_CLICK_IGNORE_CLASS } from "@hashintel/design-system/constants";

import type { CellInputProps } from "./types";

const faSquare = { icon: "transition" } as const;
const faSquareCheck = { icon: "squareCheck" } as const;
const faRightLeft = { icon: "arrowsLeftRight" } as const;

export const BooleanInput = ({
  onChange,
  value,
  showChange,
}: { showChange: boolean } & CellInputProps<boolean>) => {
  return (
    <Box
      sx={{
        position: "relative",
        zIndex: 1,
        cursor: "pointer",
      }}
      className={chipClasses.deleteIconMedium}
      onClick={() => onChange(!value)}
    >
      <Chip
        sx={{ cursor: "pointer !important" }}
        label={value ? "True" : "False"}
        icon={
          <Tooltip
            title="Boolean"
            placement="top"
            PopperProps={{
              // this className prevents editor overlay from closing
              className: GRID_CLICK_IGNORE_CLASS,
            }}
            disableInteractive
          >
            <HashInlineIcon
              icon={value ? faSquareCheck : faSquare}
              sx={{ zIndex: 1 }}
            />
          </Tooltip>
        }
      />

      {showChange && (
        <Box
          sx={{
            backgroundColor: "gray.10",
            border: "1px solid white",

            pr: 1.5,
            pl: 4.5,
            ml: -4,

            zIndex: -1,
            top: 0,
            bottom: 0,
            left: "100%",
            position: "absolute",
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            borderRadius: 13,

            color: "gray.70",
          }}
        >
          <Typography
            sx={{ fontSize: 11 }}
            variant="smallCaps"
            fontWeight={700}
          >
            Change
          </Typography>
          <HashInlineIcon icon={faRightLeft} sx={{ fontSize: 10 }} />
        </Box>
      )}
    </Box>
  );
};
