import { VersionedUri } from "@blockprotocol/type-system";
import { faClose } from "@fortawesome/free-solid-svg-icons";
import { Chip, FontAwesomeIcon } from "@hashintel/hash-design-system";
import {
  Box,
  chipClasses,
  Collapse,
  Stack,
  Tooltip,
  tooltipClasses,
  Typography,
} from "@mui/material";
import { useState, useRef, useEffect } from "react";
import { expectedValuesOptions } from "../../shared/expected-values-options";

interface DataTypeBadgeProps {
  typeId: VersionedUri | "array";
  prefix?: string;
  deleteTooltip?: string;
  onDelete?: () => void;
}

export const DataTypeBadge = ({
  typeId,
  prefix,
  deleteTooltip,
  onDelete,
}: DataTypeBadgeProps) => {
  const [hovered, setHovered] = useState(false);

  const { icon, title } = expectedValuesOptions[typeId]!;
  const isArray = typeId === "array";

  const prefixTextRef = useRef<HTMLSpanElement>(null);
  const [prefixContainerWidth, setPreficContainerWidth] = useState(0);

  useEffect(() => {
    const textWidth = prefixTextRef.current?.getBoundingClientRect().width;
    setPreficContainerWidth(textWidth ? textWidth + 24 : 0);
  }, [prefix]);

  return (
    <Stack
      direction="row"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {prefix ? (
        <Box
          sx={{
            display: "flex",
            background: ({ palette }) => palette.gray[60],
            borderTopLeftRadius: 4,
            borderBottomLeftRadius: 4,
            padding: 1.25,
            alignItems: "center",
            ...(isArray ? { borderBottomLeftRadius: 0 } : {}),
            width: prefixContainerWidth,
            transition: ({ transitions }) => transitions.create("width"),
          }}
        >
          <Typography
            ref={prefixTextRef}
            variant="smallCaps"
            sx={{
              fontSize: 11,
              color: ({ palette }) => palette.white,
              whiteSpace: "nowrap",
            }}
          >
            {prefix}
          </Typography>
        </Box>
      ) : null}

      <Box
        sx={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          background: ({ palette }) => palette.gray[70],
          paddingX: 1.5,
          pr: 0,
          alignItems: "center",
          borderRadius: 4,
          position: "relative",
          overflow: "hidden",
          ...(prefix
            ? { borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }
            : {}),
          ...(typeId === "array"
            ? {
                width: "100%",
                borderBottomLeftRadius: 0,
                borderBottomRightRadius: 0,
              }
            : {}),
        }}
      >
        <Box display="flex" alignItems="center" py={1}>
          <FontAwesomeIcon
            icon={{
              icon,
            }}
            sx={{
              color: ({ palette }) => palette.gray[40],
              marginRight: 1.5,
            }}
          />
          <Typography
            variant="smallTextLabels"
            sx={{
              fontWeight: 500,
              color: ({ palette }) => palette.white,
              py: 0.25,
              mr: 1.25,
            }}
          >
            {title}
          </Typography>

          {!isArray ? (
            <Chip
              label={
                <Typography variant="smallCaps" sx={{ fontSize: 11 }}>
                  DATA TYPE
                </Typography>
              }
              color="blue"
              sx={{
                mr: 1.25,
                borderWidth: 0,
                color: ({ palette }) => palette.blue[70],
                [`.${chipClasses.label}`]: {
                  px: 1,
                  py: 0.25,
                },
              }}
            />
          ) : null}
        </Box>

        {onDelete ? (
          <Collapse orientation="horizontal" in={hovered} sx={{ height: 1 }}>
            <Tooltip
              title={deleteTooltip ?? ""}
              placement="top"
              PopperProps={{
                sx: {
                  [`.${tooltipClasses.tooltip}`]: { mb: "0px !important" },
                },
              }}
            >
              <Box
                onClick={onDelete}
                sx={({ palette }) => ({
                  display: "flex",
                  alignItems: "center",
                  height: "100%",
                  px: 1.5,
                  backgroundColor: palette.gray[60],
                  color: palette.gray[90],
                  cursor: "pointer",
                  ":hover": {
                    backgroundColor: palette.gray[90],
                    color: palette.red[50],
                  },
                })}
              >
                <FontAwesomeIcon
                  icon={faClose}
                  sx={{
                    fontSize: "13px !important",
                  }}
                />
              </Box>
            </Tooltip>
          </Collapse>
        ) : null}
      </Box>
    </Stack>
  );
};
