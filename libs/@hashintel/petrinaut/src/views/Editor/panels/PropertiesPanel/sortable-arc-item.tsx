import { css } from "@hashintel/ds-helpers/css";
import { TbTrash } from "react-icons/tb";

import { IconButton } from "../../../../components/icon-button";
import { NumberInput } from "../../../../components/number-input";

const containerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[8px]",
  padding: "[8px 12px]",
  whiteSpace: "nowrap",
  borderBottom: "[1px solid rgba(0, 0, 0, 0.06)]",
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
  fontWeight: "medium",
});

const weightInputStyle = css({
  width: "[60px]",
  fontSize: "[14px]",
  padding: "[4px 8px]",
});

interface ArcItemProps {
  placeName: string;
  weight: number;
  disabled?: boolean;
  tooltip?: string;
  onWeightChange: (weight: number) => void;
  onDelete?: () => void;
}

export const ArcItem: React.FC<ArcItemProps> = ({
  placeName,
  weight,
  disabled = false,
  tooltip,
  onWeightChange,
  onDelete,
}) => {
  return (
    <div className={containerStyle}>
      <div className={placeNameStyle}>{placeName}</div>
      <div className={weightContainerStyle}>
        <span className={weightLabelStyle}>weight</span>
        <NumberInput
          min={1}
          step={1}
          value={weight}
          disabled={disabled}
          tooltip={tooltip}
          onChange={(event) => {
            const newWeight = Number.parseInt(event.target.value, 10);
            if (!Number.isNaN(newWeight) && newWeight >= 1) {
              onWeightChange(newWeight);
            }
          }}
          className={weightInputStyle}
        />
      </div>
      {onDelete && !disabled && (
        <IconButton aria-label="Delete" variant="danger" onClick={onDelete}>
          <TbTrash size={16} />
        </IconButton>
      )}
    </div>
  );
};
