import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { css } from "@hashintel/ds-helpers/css";
import { MdDragIndicator } from "react-icons/md";
import { TbTrash } from "react-icons/tb";

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

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 0",
        whiteSpace: "nowrap",
      }}
    >
      <div
        {...attributes}
        {...listeners}
        style={{
          cursor: disabled ? "default" : "grab",
          display: "flex",
          alignItems: "center",
          color: disabled ? "#ccc" : "#999",
          flexShrink: 0,
          pointerEvents: disabled ? "none" : "auto",
        }}
      >
        <MdDragIndicator size={16} />
      </div>
      <div
        style={{
          flex: 1,
          fontSize: 14,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {placeName}
      </div>
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
        style={{
          width: 60,
          fontSize: 14,
          padding: "4px 8px",
          border: "1px solid rgba(0, 0, 0, 0.1)",
          borderRadius: 4,
          boxSizing: "border-box",
          flexShrink: 0,
          backgroundColor: disabled ? "rgba(0, 0, 0, 0.05)" : "white",
          cursor: disabled ? "not-allowed" : "text",
        }}
      />
      {onDelete && !disabled && (
        <button
          type="button"
          onClick={onDelete}
          className={css({
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
            flexShrink: "0",
            borderRadius: "radius.4",
            _hover: {
              color: "core.red.60",
              backgroundColor: "core.red.10",
            },
          })}
        >
          <TbTrash size={16} />
        </button>
      )}
    </div>
  );
};
