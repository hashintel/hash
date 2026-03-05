import { css, cx } from "@hashintel/ds-helpers/css";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { FaChevronDown } from "react-icons/fa6";
import { TbTrash } from "react-icons/tb";

import { NumberInput } from "./number-input";
import { Select, type SelectOption } from "./select";

// -- Types -------------------------------------------------------------------

export interface PlaceOption {
  id: string;
  name: string;
  color?: string;
}

// -- ArcList (container) -----------------------------------------------------

const arcListStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1.5",
});

export const ArcList = ({ children }: { children: ReactNode }) => (
  <div className={arcListStyle}>{children}</div>
);

// -- ArcItem (row) -----------------------------------------------------------

const rowStyle = css({
  "--border-color": "[rgba(0, 0, 0, 0.09)]",
  "--border-width": "[1px]",
  "--background-color": "[white]",
  "--inset-lip-radius": "[4px]",
  "--inset-lip-height": "[7px]",
  display: "flex",
  alignItems: "center",
  justifyItems: "center",
  justifyContent: "center",
  height: "[28px]",
  position: "relative",
  "& [data-arc-delete]": {
    width: "0",
    opacity: "0",
    transition: "[width 150ms ease, opacity 150ms ease]",
  },
  "&:hover [data-arc-delete]": {
    width: "5",
    opacity: "1",
  },
});

const rowDisabledStyle = css({
  opacity: "[0.6]",
});

const nameCellStyle = css({
  flex: "[1]",
  display: "flex",
  alignItems: "center",
  gap: "2",
  px: "1.5",
  height: "[100%]",
  minWidth: "[0]",
  backgroundColor: "[var(--background-color)]",
  border: "[var(--border-width) solid var(--border-color)]",
  borderRadius: "lg",
  borderRightRadius: "[var(--inset-lip-radius)]",
  cursor: "pointer",
});

const nameCellInnerStyle = css({
  display: "flex",
  textAlign: "left",
  alignItems: "center",
  gap: "2",
  width: "[100%]",
  minWidth: "[0]",
});

const colorDotStyle = css({
  width: "[16px]",
  height: "[16px]",
  borderRadius: "[50%]",
  flexShrink: 0,
});

const nameTextStyle = css({
  flex: "[1]",
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "[16px]",
  color: "neutral.fg.heading",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const chevronStyle = css({
  flexShrink: 0,
  color: "[rgba(0, 0, 0, 0.3)]",
  display: "flex",
  alignItems: "center",
});

const separatorContainerStyle = css({
  position: "relative",
  zIndex: 2,
  marginLeft: "[calc(-1 * var(--border-width))]",
  marginRight: "[calc(-1 * var(--border-width))]",
});

const separatorBorderStyle = css({
  position: "absolute",
  top: "[0]",
  left: "[0]",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  gap: "[var(--inset-lip-height)]",
  "& > div": {
    width: "[calc(var(--inset-lip-radius)*2)]",
    height: "var(--inset-lip-radius)",
    borderWidth: "var(--border-width)",
    borderColor: "var(--border-color)",
    flexShrink: 0,
  },
  "& > div:first-child": {
    borderTopWidth: "0px",
    borderBottomRadius: "[var(--inset-lip-radius)]",
  },
  "& > div:last-child": {
    borderBottomWidth: "0px",
    borderTopRadius: "[var(--inset-lip-radius)]",
  },
});

const separatorBackgroundStyle = css({
  zIndex: 2,
  width: "[calc(var(--inset-lip-radius)*2)]",
  height: "[calc(var(--inset-lip-radius)*2 + var(--inset-lip-height))]",
  background: "[var(--background-color)]",
  flexShrink: 0,
});

const separatorMaskStyle: React.CSSProperties = {
  maskImage:
    "linear-gradient(to right, transparent var(--border-width), black var(--border-width), black calc(100% - var(--border-width)), transparent calc(100% - var(--border-width)))",
};

const separatorBarMaskStyle: React.CSSProperties = {
  maskImage: [
    "radial-gradient(circle at 50% 0, transparent var(--inset-lip-radius), black var(--inset-lip-radius))",
    "radial-gradient(circle at 50% 100%, transparent var(--inset-lip-radius), black var(--inset-lip-radius))",
  ].join(", "),
  maskComposite: "intersect",
  WebkitMaskComposite: "source-in" as string,
};

const weightCellStyle = css({
  width: "[54px]",
  height: "[100%]",
  flexShrink: 0,
  backgroundColor: "[var(--background-color)]",
  border: "none",
  borderRadius: "lg",
  borderLeftRadius: "[var(--inset-lip-radius)]",
  overflow: "hidden",
});

const weightInputOverrideStyle = css({
  height: "[100%]",
  border: "[none]",
  background: "[transparent]",
  borderRadius: "[0]",
  textAlign: "right",
  paddingX: "2",
  paddingY: "0",
  outline: "[none]",
  _hover: {
    border: "[none]",
  },
  _focus: {
    boxShadow: "[none]",
    border: "[none]",
    outline: "[none]",
  },
  _active: {
    boxShadow: "[none]",
    border: "[none]",
  },
});

const deleteContainerStyle = css({
  overflow: "hidden",
  flexShrink: 0,
  height: "[100%]",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});

const deleteButtonStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  background: "[none]",
  border: "none",
  padding: "[0]",
  color: "[#ef4444]",
  height: "[100%]",
});

// -- Select trigger style overrides for ArcItem -------------------------------

const selectRootOverrideStyle = css({
  flex: "[1]",
  minWidth: "[0]",
  height: "[100%]",
});

const selectTriggerOverrideStyle = css({
  backgroundColor: "[var(--background-color)]",
  border: "[var(--border-width) solid var(--border-color)]",
  borderRadius: "lg",
  borderRightRadius: "[var(--inset-lip-radius)]",
  height: "[100%]",
  paddingX: "1.5",
  paddingY: "0",
  gap: "2",
  justifyContent: "flex-start",
  _hover: {
    borderColor: "[var(--border-color)]",
  },
  _focusVisible: {
    boxShadow: "[none]",
    borderColor: "[var(--border-color)]",
  },
});

const selectItemDotStyle = css({
  width: "[12px]",
  height: "[12px]",
  borderRadius: "[50%]",
  flexShrink: 0,
});

// -- Component ---------------------------------------------------------------

interface ArcItemProps {
  placeName: string;
  placeId: string;
  weight: number;
  color?: string;
  disabled?: boolean;
  availablePlaces?: PlaceOption[];
  onPlaceChange?: (placeId: string) => void;
  onWeightChange: (weight: number) => void;
  onDelete?: () => void;
}

export const ArcItem = ({
  placeName,
  placeId,
  weight,
  color,
  disabled = false,
  availablePlaces,
  onPlaceChange,
  onWeightChange,
  onDelete,
}: ArcItemProps) => {
  const selectOptions: SelectOption[] = useMemo(
    () =>
      availablePlaces?.map((pl) => ({
        value: pl.id,
        label: pl.name,
        color: pl.color,
      })) ?? [],
    [availablePlaces],
  );

  const nameCellContent = (
    <div className={nameCellInnerStyle}>
      <div
        className={colorDotStyle}
        style={{ backgroundColor: color ?? "#d4d4d4" }}
      />
      <span className={nameTextStyle}>{placeName}</span>
      <FaChevronDown size={10} className={chevronStyle} />
    </div>
  );

  const hasSelect = availablePlaces && onPlaceChange && !disabled;

  return (
    <div className={cx(rowStyle, disabled && rowDisabledStyle)}>
      {hasSelect ? (
        <Select
          value={placeId}
          onValueChange={(newId) => {
            if (newId !== placeId) {
              onPlaceChange(newId);
            }
          }}
          options={selectOptions}
          className={selectRootOverrideStyle}
          triggerClassName={selectTriggerOverrideStyle}
          renderTrigger={() => nameCellContent}
          renderItem={(item) => {
            const placeColor = availablePlaces.find(
              (pl) => pl.id === item.value,
            )?.color;
            return (
              <>
                <div
                  className={selectItemDotStyle}
                  style={{
                    backgroundColor: placeColor ?? "#d4d4d4",
                  }}
                />
                {item.label}
              </>
            );
          }}
          positioning={{ sameWidth: true }}
        />
      ) : (
        <div className={nameCellStyle}>{nameCellContent}</div>
      )}
      <div className={separatorContainerStyle}>
        <div className={separatorBorderStyle} style={separatorMaskStyle}>
          <div />
          <div />
        </div>
        <div
          className={separatorBackgroundStyle}
          style={separatorBarMaskStyle}
        />
      </div>
      <div className={weightCellStyle}>
        <NumberInput
          value={weight}
          min={1}
          step={1}
          disabled={disabled}
          size="sm"
          className={weightInputOverrideStyle}
          onChange={(event) => {
            const newWeight = Number.parseInt(
              (event.target as HTMLInputElement).value,
              10,
            );
            if (!Number.isNaN(newWeight) && newWeight >= 1) {
              onWeightChange(newWeight);
            }
          }}
        />
      </div>
      {onDelete && !disabled && (
        <div data-arc-delete="" className={deleteContainerStyle}>
          <button
            type="button"
            className={deleteButtonStyle}
            onClick={onDelete}
            aria-label="Delete arc"
          >
            <TbTrash size={14} />
          </button>
        </div>
      )}
    </div>
  );
};
