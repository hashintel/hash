import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { css, cva } from "@hashintel/ds-helpers/css";
import { MdDragIndicator } from "react-icons/md";
import { TbTrash } from "react-icons/tb";

import { FEATURE_FLAGS } from "../../../../feature-flags";

const containerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[8px]",
  padding: "[8px 12px]",
  whiteSpace: "nowrap",
  borderBottom: "[1px solid rgba(0, 0, 0, 0.06)]",
});

const dragHandleStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
  },
  variants: {
    isDisabled: {
      true: {
        cursor: "default",
        color: "[#ccc]",
        pointerEvents: "none",
      },
      false: {
        cursor: "grab",
        color: "[#999]",
        pointerEvents: "auto",
      },
    },
  },
});

const placeNameStyle = css({
  flex: "[1]",
  fontSize: "[14px]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const weightContainerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
  flexShrink: 0,
});

const weightLabelStyle = css({
  fontSize: "[11px]",
  color: "[#999]",
  textTransform: "uppercase",
  letterSpacing: "[0.5px]",
  fontWeight: 500,
});

const weightInputStyle = cva({
  base: {
    width: "[60px]",
    fontSize: "[14px]",
    padding: "[4px 8px]",
    border: "[1px solid rgba(0, 0, 0, 0.1)]",
    borderRadius: "[4px]",
    boxSizing: "border-box",
  },
  variants: {
    isDisabled: {
      true: {
        backgroundColor: "[rgba(0, 0, 0, 0.05)]",
        cursor: "not-allowed",
      },
      false: {
        backgroundColor: "[white]",
        cursor: "text",
      },
    },
  },
});

const deleteButtonStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[24px]",
  height: "[24px]",
  padding: "spacing.0",
  border: "none",
  background: "[transparent]",
  cursor: "pointer",
  color: "core.gray.60",
  flexShrink: 0,
  borderRadius: "radius.4",
  _hover: {
    color: "core.red.60",
    backgroundColor: "core.red.10",
  },
});

/**
 * SortableArcItem - A draggable arc item that displays place name and weight
 */
interface SortableArcItemProps {
  id: string;
  placeName: string;
  weight: number;
  disabled?: boolean;
  onWeightChange: (weight: number) => void;
  onDelete?: () => void;
}

export const SortableArcItem: React.FC<SortableArcItemProps> = ({
  id,
  placeName,
  weight,
  disabled = false,
  onWeightChange,
  onDelete,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const transformStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={transformStyle} className={containerStyle}>
      {FEATURE_FLAGS.REORDER_TRANSITION_ARCS && (
        <div
          {...attributes}
          {...listeners}
          className={dragHandleStyle({ isDisabled: disabled })}
        >
          <MdDragIndicator size={16} />
        </div>
      )}
      <div className={placeNameStyle}>{placeName}</div>
      <div className={weightContainerStyle}>
        <span className={weightLabelStyle}>weight</span>
        <input
          type="number"
          min="1"
          step="1"
          value={weight}
          disabled={disabled}
          onChange={(event) => {
            const newWeight = Number.parseInt(event.target.value, 10);
            if (!Number.isNaN(newWeight) && newWeight >= 1) {
              onWeightChange(newWeight);
            }
          }}
          className={weightInputStyle({ isDisabled: disabled })}
        />
      </div>
      {onDelete && !disabled && (
        <button type="button" onClick={onDelete} className={deleteButtonStyle}>
          <TbTrash size={16} />
        </button>
      )}
    </div>
  );
};
