import { VersionedUri } from "@blockprotocol/type-system";
import { faEdit } from "@fortawesome/free-regular-svg-icons";
import { faClose } from "@fortawesome/free-solid-svg-icons";
import {
  Chip,
  ChipProps,
  FontAwesomeIcon,
  IconButton,
} from "@hashintel/design-system";
import { Box, chipClasses, Collapse, Stack, Typography } from "@mui/material";
import { useState } from "react";

import { ArrayType } from "../../shared/expected-value-types";
import { expectedValuesOptions } from "../../shared/expected-values-options";

interface ExpectedValueChipProps {
  expectedValueType: VersionedUri | ArrayType | "object" | "array";
  editable?: boolean;
  onEdit?: () => void;
}

export const ExpectedValueChip = ({
  expectedValueType,
  editable,
  onEdit,
  onDelete,
  ...props
}: ChipProps & ExpectedValueChipProps) => {
  const [hovered, setHovered] = useState(false);

  const { icon, title, colors } = expectedValuesOptions[expectedValueType]!;

  return (
    <Stack
      width={1}
      direction="row"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Chip
        {...props}
        label={
          <Stack direction="row">
            <Typography
              variant="smallTextLabels"
              sx={{
                display: "flex",
                alignItems: "center",
                color: colors.textColor,
                py: 0.25,
                pr: hovered ? 0.75 : 1.5,
                transition: ({ transitions }) =>
                  transitions.create("padding-right"),
              }}
            >
              <FontAwesomeIcon
                icon={{
                  icon,
                }}
                sx={{ fontSize: "1em", mr: "1ch" }}
              />
              {title}
            </Typography>

            <Collapse orientation="horizontal" in={hovered}>
              <Stack direction="row" height={1}>
                {editable ? (
                  <IconButton
                    onClick={onEdit}
                    sx={{
                      p: 0,
                      mr: 1,
                      color: colors.textColor,
                      ":hover": {
                        backgroundColor: "transparent",
                        color: colors.hoveredButtonColor,
                      },
                    }}
                  >
                    <FontAwesomeIcon
                      icon={faEdit}
                      sx={{
                        fontSize: "13px !important",
                      }}
                    />
                  </IconButton>
                ) : null}

                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    height: "100%",
                    pl: 0.75,
                    pr: 1,
                    backgroundColor: ({ palette }) => palette.gray[10],
                  }}
                >
                  <IconButton
                    onClick={onDelete}
                    sx={{
                      p: 0,
                      ":hover": {
                        backgroundColor: "transparent",
                      },
                    }}
                  >
                    <FontAwesomeIcon
                      icon={faClose}
                      sx={{
                        fontSize: "13px !important",
                      }}
                    />
                  </IconButton>
                </Box>
              </Stack>
            </Collapse>
          </Stack>
        }
        onDelete={undefined}
        sx={{
          position: "relative",
          backgroundColor: colors.backgroundColor,
          overflow: "hidden",
          [`.${chipClasses.deleteIcon}`]: {
            color: colors.textColor,
          },
          [`.${chipClasses.label}`]: {
            p: 0,
            pl: 1.5,
          },
        }}
      />
    </Stack>
  );
};
