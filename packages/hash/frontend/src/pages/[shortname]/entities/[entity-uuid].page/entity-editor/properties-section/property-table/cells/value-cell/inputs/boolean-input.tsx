import { faSquare, faSquareCheck } from "@fortawesome/free-regular-svg-icons";
import { faRightLeft } from "@fortawesome/free-solid-svg-icons";
import { Chip, FontAwesomeIcon } from "@local/hash-design-system";
import { Box, chipClasses, Tooltip, Typography } from "@mui/material";

import { CellInputProps } from "./types";

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
          <Tooltip title="Boolean" placement="top">
            <FontAwesomeIcon
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
          <FontAwesomeIcon icon={faRightLeft} sx={{ fontSize: 10 }} />
        </Box>
      )}
    </Box>
  );
};
