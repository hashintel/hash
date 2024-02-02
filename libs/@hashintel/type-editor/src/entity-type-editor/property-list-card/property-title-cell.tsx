import { extractBaseUrl, PropertyType } from "@blockprotocol/type-system/slim";
import { faChevronRight, faList } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, IconButton } from "@hashintel/design-system";
import { Box, Collapse, Fade, TableCell } from "@mui/material";
import { useWatch } from "react-hook-form";

import { EntityTypeEditorFormData } from "../../shared/form-types";
import { useIsReadonly } from "../../shared/read-only-context";
import { ArrowTurnDownRightIcon } from "../shared/arrow-turn-down-right-icon";
import {
  CollapsibleRowLine,
  ROW_DEPTH_INDENTATION,
} from "../shared/collapsible-row-line";
import { EntityTypeTableTitleCellText } from "../shared/entity-type-table";
import { useInheritedValuesForCurrentDraft } from "../shared/use-inherited-values";
import { VersionUpgradeIndicator } from "../shared/version-upgrade-indicator";
import { TagIcon } from "./property-title-cell/tag-icon";

interface PropertyTitleCellProps {
  property: PropertyType;
  array: boolean;
  depth: number;
  inherited?: boolean;
  lines: boolean[];
  expanded?: boolean;
  currentVersion: number;
  latestVersion: number;
  setExpanded?: (expanded: boolean) => void;
  onUpdateVersion: () => void;
}

const PROPERTY_TITLE_CELL_WIDTH = 260;

export const PropertyTitleCell = ({
  property,
  array,
  depth = 0,
  inherited,
  lines,
  expanded,
  setExpanded,
  currentVersion,
  latestVersion,
  onUpdateVersion,
}: PropertyTitleCellProps) => {
  const isReadonly = useIsReadonly();

  const { labelProperty: inheritedLabelProperty } =
    useInheritedValuesForCurrentDraft();

  const labelProperty = useWatch<EntityTypeEditorFormData>({
    name: "labelProperty",
  });

  const isLabelProperty =
    (labelProperty ?? inheritedLabelProperty) === extractBaseUrl(property.$id);

  return (
    <TableCell width={PROPERTY_TITLE_CELL_WIDTH} sx={{ position: "relative" }}>
      {depth !== 0 ? (
        <>
          {lines.map((display, lineDepth) =>
            display || lineDepth === lines.length - 1 ? (
              <CollapsibleRowLine
                // eslint-disable-next-line react/no-array-index-key
                key={lineDepth}
                height={`${display ? 100 : 50}%`}
                depth={lineDepth}
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
              left: Math.max(0, depth - 1) * ROW_DEPTH_INDENTATION,
              background: ({ palette }) => palette.gray[30],
              ml: 1.6875,
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
          whiteSpace: "nowrap",
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

        {inherited && <ArrowTurnDownRightIcon sx={{ mr: 1 }} />}

        <Box>{property.title}</Box>

        {isLabelProperty && (
          <Box
            sx={({ palette }) => ({
              background: palette.gray[20],
              border: `1px solid ${palette.gray[30]}`,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 18,
              width: 18,
              ml: 1,
            })}
          >
            <TagIcon
              sx={{ fontSize: 9, fill: ({ palette }) => palette.common.black }}
            />
          </Box>
        )}

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

        {depth === 0 &&
        currentVersion !== latestVersion &&
        !inherited &&
        !isReadonly ? (
          <VersionUpgradeIndicator
            currentVersion={currentVersion}
            latestVersion={latestVersion}
            onUpdateVersion={onUpdateVersion}
          />
        ) : null}
      </EntityTypeTableTitleCellText>
    </TableCell>
  );
};
