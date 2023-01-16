import { PropertyType } from "@blockprotocol/type-system";
import {
  faArrowsRotate,
  faChevronRight,
  faList,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, IconButton } from "@hashintel/hash-design-system";
import {
  Box,
  Collapse,
  Fade,
  Stack,
  svgIconClasses,
  TableCell,
  Typography,
} from "@mui/material";

import { ArrowRightIcon } from "../../../../../../../shared/icons/arrow-right-icon";
import { EntityTypeTableTitleCellText } from "../shared/entity-type-table";

interface PropertyTitleCellProps {
  property: PropertyType;
  array: boolean;
  depth: number;
  lines: boolean[];
  expanded?: boolean;
  currentVersion?: string;
  newestVersion?: string;
  setExpanded?: (expanded: boolean) => void;
}

const PROPERTY_TITLE_CELL_WIDTH = 260;

export const PropertyTitleCell = ({
  property,
  array,
  depth = 0,
  lines,
  expanded,
  setExpanded,
  currentVersion,
  newestVersion,
}: PropertyTitleCellProps) => {
  return (
    <TableCell width={PROPERTY_TITLE_CELL_WIDTH} sx={{ position: "relative" }}>
      {depth !== 0 ? (
        <>
          {lines.map((display, lineDepth) =>
            display || lineDepth === lines.length - 1 ? (
              <Box
                // eslint-disable-next-line react/no-array-index-key
                key={lineDepth}
                sx={{
                  position: "absolute",
                  height: `${display ? 100 : 50}%`,
                  width: "1px",
                  left: `${13.4 + 20 * lineDepth}px`,
                  top: 0,
                  background: ({ palette }) => palette.gray[30],
                  zIndex: 1,
                }}
              />
            ) : null,
          )}
          <Box
            sx={{
              width: 10.5,
              height: "1px",
              position: "absolute",
              top: "50%",
              transform: "translateY(-50%)",
              left: Math.max(0, depth - 1) * 20 + 13.5,
              background: ({ palette }) => palette.gray[30],
            }}
          />
        </>
      ) : null}
      <EntityTypeTableTitleCellText
        sx={{
          paddingLeft: (depth - 1) * 3,
          transition: ({ transitions }) => transitions.create("transform"),
          transform:
            expanded !== undefined && depth === 0
              ? "translateX(-20px)"
              : "none",
        }}
      >
        <Collapse
          orientation="horizontal"
          in={expanded !== undefined}
          sx={{ height: 1 }}
        >
          <IconButton
            onClick={() => setExpanded?.(!expanded)}
            size="xs"
            unpadded
            rounded
            sx={({ transitions }) => ({
              p: 0.25,
              visibility: "visible",
              pointerEvents: "auto",
              transform: expanded ? "rotate(90deg)" : "none",
              transition: transitions.create("transform", { duration: 300 }),
              marginRight: 1,
            })}
          >
            <FontAwesomeIcon icon={faChevronRight} />
          </IconButton>
        </Collapse>

        <Box>{property.title}</Box>

        <Fade in={array} appear={false}>
          <FontAwesomeIcon
            sx={{
              color: ({ palette }) => palette.gray[70],
              fontSize: 14,
              ml: 1,
            }}
            icon={faList}
          />
        </Fade>

        {depth === 0 && currentVersion !== newestVersion ? (
          <Stack direction="row" gap={1} alignItems="center">
            <Typography
              variant="smallTextLabels"
              color="gray.50"
              fontWeight={500}
            >
              v{currentVersion}
            </Typography>
            <ArrowRightIcon
              sx={{ color: ({ palette }) => palette.gray[50], fontSize: 14 }}
            />
            <Typography
              variant="smallTextLabels"
              color="blue.70"
              fontWeight={500}
            >
              v{newestVersion}
            </Typography>
            <IconButton
              sx={{
                p: 0.5,
                minWidth: 0,
                minHeight: 0,
                fontSize: 11,
                fontWeight: 700,
                color: ({ palette }) => palette.blue[70],
                textTransform: "uppercase",
                gap: 0.625,
                lineHeight: "18px",
                ":hover": {
                  color: ({ palette }) => palette.blue[70],

                  [`.${svgIconClasses.root}`]: {
                    transform: "rotate(360deg)",
                    transition: ({ transitions }) =>
                      transitions.create("transform"),
                  },
                },
              }}
            >
              <FontAwesomeIcon
                icon={faArrowsRotate}
                sx={{
                  fontSize: 11,
                }}
              />
              Update
            </IconButton>
          </Stack>
        ) : null}
      </EntityTypeTableTitleCellText>
    </TableCell>
  );
};
