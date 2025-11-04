import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MdDragIndicator } from "react-icons/md";

/**
 * SortableArcItem - A draggable arc item that displays place name and weight
 */
interface SortableArcItemProps {
  id: string;
  placeName: string;
  weight: number;
  disabled?: boolean;
  onWeightChange: (weight: number) => void;
}

export const SortableArcItem: React.FC<SortableArcItemProps> = ({
  id,
  placeName,
  weight,
  disabled = false,
  onWeightChange,
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
    </div>
  );
};
