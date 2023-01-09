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
import { ReactNode, useEffect, useRef, useState } from "react";

import { DefaultExpectedValueTypeId } from "../../../property-type-form-values";
import { expectedValuesOptions } from "./expected-values-options";

interface ExpectedValueBadgeProps {
  typeId: DefaultExpectedValueTypeId;
  prefix?: string;
  deleteTooltip?: string;
  endNode?: ReactNode;
  onDelete?: () => void;
}

export const ExpectedValueBadge = ({
  typeId,
  prefix,
  deleteTooltip,
  endNode,
  onDelete,
}: ExpectedValueBadgeProps) => {
  const [hovered, setHovered] = useState(false);

  const { icon, title } = expectedValuesOptions[typeId]!;

  const isArray = typeId === "array";
  const isObject = typeId === "object";
  const isDataType = !isArray && !isObject;

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
            borderBottomLeftRadius: isArray ? 0 : 4,
            padding: 1.25,
            alignItems: "center",
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
          borderRadius: 1,
          position: "relative",
          overflow: "hidden",
          ...(prefix
            ? { borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }
            : {}),
          ...(!isDataType
            ? {
                width: "100%",
                borderBottomLeftRadius: isObject && !prefix ? 4 : 0,
                borderBottomRightRadius: 0,
              }
            : {}),
        }}
      >
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          flex={1}
          py={1}
        >
          <Box sx={{ display: "flex", alignItems: "center" }}>
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

            {isDataType ? (
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

          <Box pr={1.5}>{endNode}</Box>
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
