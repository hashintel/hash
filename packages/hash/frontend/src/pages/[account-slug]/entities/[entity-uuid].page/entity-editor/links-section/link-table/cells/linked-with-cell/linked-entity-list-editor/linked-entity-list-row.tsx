import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { Box } from "@mui/material";
import { useState } from "react";
import { RowAction } from "../../../../../properties-section/property-table/cells/value-cell/value-cell-editor/array-editor/row-action";
import { ValueChip } from "../../../../../properties-section/property-table/cells/value-cell/value-cell-editor/array-editor/value-chip";

export const LinkedEntityListRow = ({
  title,
  onDelete,
  selected,
  onSelect,
}: {
  title: string;
  selected: boolean;
  onDelete: () => void;
  onSelect: () => void;
}) => {
  const [hovered, setHovered] = useState(false);

  const shouldShowActions = hovered || selected;
  return (
    <Box
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      sx={{
        height: 48,
        display: "flex",
        alignItems: "center",
        borderBottom: "1px solid",
        borderColor: "gray.20",
        position: "relative",
        outline: "none",
        px: 1.5,
      }}
      onClick={onSelect}
    >
      <ValueChip selected={selected} value={title} />

      {shouldShowActions && (
        <Box
          display="flex"
          sx={{
            position: "absolute",
            inset: 0,
            left: "unset",
            "::before": {
              content: `""`,
              width: 50,
              background: `linear-gradient(90deg, transparent 0%, white 100%)`,
            },
          }}
        >
          <Box sx={{ display: "flex", background: "white" }}>
            <RowAction tooltip="Delete" icon={faTrash} onClick={onDelete} />
          </Box>
        </Box>
      )}
    </Box>
  );
};
