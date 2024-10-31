import { faTrash } from "@fortawesome/free-solid-svg-icons";
import type { EntityId } from "@local/hash-graph-types/entity";
import { Box } from "@mui/material";

import { useEntityEditor } from "../../../../../entity-editor-context";
import { RowAction } from "../../../../../properties-section/property-table/cells/value-cell/array-editor/row-action";
import { ValueChip } from "../../../../../properties-section/property-table/cells/value-cell/array-editor/value-chip";

export const LinkedEntityListRow = ({
  entityId,
  title,
  onDelete,
  imageSrc,
}: {
  entityId: EntityId;
  title: string;
  imageSrc?: string;
  onDelete: () => void;
}) => {
  const { readonly, onEntityClick } = useEntityEditor();

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
      <Box
        component="button"
        onClick={() => onEntityClick(entityId)}
        sx={{
          background: "none",
          border: "none",
          cursor: "pointer",
          maxWidth: "100%",
          p: 0,
          textAlign: "left",
        }}
      >
        <ValueChip imageSrc={imageSrc} selected={false} title={title} />
      </Box>

      {!readonly && (
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
      )}
    </Box>
  );
};
