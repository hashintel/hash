import { VersionedUri } from "@blockprotocol/type-system-web";
import {
  Chip,
  ChipProps,
  FontAwesomeIcon,
} from "@hashintel/hash-design-system";
import { Box, chipClasses, Collapse, Typography } from "@mui/material";
import { useState } from "react";
import { ArrayType, dataTypeData } from "./property-type-utils";

export interface ExpectedValueChipProps {
  expectedValueTypeType: VersionedUri | ArrayType;
  editable?: boolean;
}

export const ExpectedValueChip = ({
  expectedValueTypeType,
  editable,
  ...props
}: ChipProps & ExpectedValueChipProps) => {
  const [hovered, setHovered] = useState(false);

  const { icon, title, colors } = dataTypeData[expectedValueTypeType]!;

  return (
    <Box
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Chip
        {...props}
        label={
          <Typography
            variant="smallTextLabels"
            sx={{
              display: "flex",
              alignItems: "center",
              color: colors.textColor,
            }}
          >
            <FontAwesomeIcon
              icon={{
                icon,
              }}
              sx={{ fontSize: "1em", mr: "1ch" }}
            />
            {title}

            {editable ? (
              <Collapse orientation="horizontal" in={hovered}>
                hey
              </Collapse>
            ) : null}
          </Typography>
        }
        onDelete={undefined}
        sx={({ transitions }) => ({
          backgroundColor: colors.backgroundColor,
          [`.${chipClasses.deleteIcon}`]: {
            color: colors.textColor,
          },
          ...(hovered
            ? { borderTopRightRadius: 0, borderBottomRightRadius: 0 }
            : {}),
          transition: transitions.create([
            "border-top-right-radius",
            "border-bottom-right-radius",
          ]),
        })}
      />
    </Box>
  );
};
