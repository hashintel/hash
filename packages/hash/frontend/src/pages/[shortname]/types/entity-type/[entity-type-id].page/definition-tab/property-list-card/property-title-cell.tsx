import { PropertyType } from "@blockprotocol/type-system";
import { faChevronRight, faList } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, IconButton } from "@hashintel/hash-design-system";
import { Box, Collapse, Fade, TableCell } from "@mui/material";

import { EntityTypeTableTitleCellText } from "../shared/entity-type-table";

interface PropertyTitleCellProps {
  property: PropertyType;
  array: boolean;
  depth: number;
  lines: boolean[];
  expanded?: boolean;
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
                  display: "flex",
                  justifyContent: "center",
                  position: "absolute",
                  height: `${display ? 100 : 50}%`,
                  width: 8,
                  left: `${10 + 20 * (depth - 1)}px`,
                  top: 0,
                  zIndex: 1,
                }}
              >
                <Box
                  sx={{
                    height: 1,
                    width: "1px",
                    background: ({ palette }) => palette.gray[30],
                  }}
                />
              </Box>
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
      </EntityTypeTableTitleCellText>
    </TableCell>
  );
};
