import { PropertyType } from "@blockprotocol/type-system";
import { faChevronRight, faList } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, IconButton } from "@hashintel/hash-design-system";
import { Box, Fade } from "@mui/material";

import { EntityTypeTableTitleCellText } from "../shared/entity-type-table";

interface PropertyTitleProps {
  property: PropertyType;
  array: boolean;
  depth: number;
  expanded?: boolean;
  setExpanded?: (expanded: boolean) => void;
}

export const PropertyTitle = ({
  property,
  array,
  depth = 0,
  expanded,
  setExpanded,
}: PropertyTitleProps) => {
  const object =
    "type" in property.oneOf[0] && property.oneOf[0].type === "object";

  return (
    <>
      {depth !== 0 ? (
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
      ) : null}
      <EntityTypeTableTitleCellText
        sx={{
          paddingLeft: (depth - 1) * 3,
          transform: object && depth === 0 ? "translateX(-20px)" : "none",
        }}
      >
        {object ? (
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
        ) : null}

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
    </>
  );
};
