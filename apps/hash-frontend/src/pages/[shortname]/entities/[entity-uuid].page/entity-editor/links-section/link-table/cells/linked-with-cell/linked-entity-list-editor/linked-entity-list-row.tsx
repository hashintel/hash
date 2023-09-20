import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { Box } from "@mui/material";

import { RowAction } from "../../../../../properties-section/property-table/cells/value-cell/array-editor/row-action";
import { ValueChip } from "../../../../../properties-section/property-table/cells/value-cell/array-editor/value-chip";

export const LinkedEntityListRow = ({
  title,
  onDelete,
  imageSrc,
}: {
  title: string;
  imageSrc?: string;
  onDelete: () => void;
}) => {
  return (
    <Box
      sx={{
        height: 48,
        display: "flex",
        alignItems: "center",
        borderBottom: "1px solid",
        borderColor: "gray.20",
        position: "relative",
        outline: "none",
        px: 1.5,

        "&:hover": {
          "> .actions": {
            visibility: "visible",
          },
        },
      }}
    >
      <ValueChip imageSrc={imageSrc} selected={false} title={title} />

      <Box
        className="actions"
        display="flex"
        sx={{
          visibility: "hidden",
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
    </Box>
  );
};
