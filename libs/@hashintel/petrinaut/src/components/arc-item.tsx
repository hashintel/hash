import { Portal } from "@ark-ui/react/portal";
import { createListCollection, Select } from "@ark-ui/react/select";
import { css, cx } from "@hashintel/ds-helpers/css";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { FaChevronDown } from "react-icons/fa6";
import { TbTrash } from "react-icons/tb";

import { usePortalContainerRef } from "../state/portal-container-context";

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
  gap: "[6px]",
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
    opacity: "[0]",
    transition: "[opacity 100ms ease]",
  },
  "&:hover [data-arc-delete]": {
    opacity: "[1]",
  },
});

const rowDisabledStyle = css({
  opacity: "[0.6]",
});

const nameCellStyle = css({
  flex: "[1]",
  display: "flex",
  alignItems: "center",
  gap: "[8px]",
  px: "[6px]",
  height: "[100%]",
  minWidth: "[0]",
  backgroundColor: "[var(--background-color)]",
  border: "[var(--border-width) solid var(--border-color)]",
  borderRadius: "[8px]",
  borderRightRadius: "[var(--inset-lip-radius)]",
  cursor: "pointer",
});

const colorDotStyle = css({
  width: "[16px]",
  height: "[16px]",
  borderRadius: "[50%]",
  flexShrink: 0,
});

const nameTextStyle = css({
  flex: "[1]",
  fontSize: "[14px]",
  fontWeight: "[500]",
  lineHeight: "[16px]",
  color: "[#171717]",
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
  border: "[var(--border-width) solid var(--border-color)]",
  borderRadius: "[8px]",
  borderLeftRadius: "[var(--inset-lip-radius)]",
  position: "relative",
  overflow: "hidden",
});

const weightInputStyle = css({
  width: "[100%]",
  height: "[100%]",
  border: "none",
  background: "[transparent]",
  fontSize: "[14px]",
  fontWeight: "[500]",
  color: "[#484848]",
  textAlign: "right",
  padding: "[0 8px]",
  outline: "none",
  appearance: "[textfield]",
  "&::-webkit-inner-spin-button": {
    display: "none",
  },
  "&::-webkit-outer-spin-button": {
    display: "none",
  },
});

const deleteOverlayStyle = css({
  position: "absolute",
  inset: "[0]",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  background: "[var(--background-color)]",
  border: "none",
  color: "[#ef4444]",
});

const selectRootStyle = css({
  flex: "[1]",
  minWidth: "[0]",
  height: "[100%]",
});

// -- Select dropdown styles --------------------------------------------------

const selectContentStyle = css({
  backgroundColor: "[white]",
  border: "[1px solid rgba(0, 0, 0, 0.1)]",
  borderRadius: "[8px]",
  boxShadow: "[0 4px 16px rgba(0, 0, 0, 0.12)]",
  padding: "[4px]",
  maxHeight: "[200px]",
  overflowY: "auto",
  outline: "none",
  zIndex: 1000,
});

const selectItemStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[8px]",
  padding: "[6px 8px]",
  borderRadius: "[4px]",
  fontSize: "[14px]",
  fontWeight: "[500]",
  cursor: "pointer",
  outline: "none",
  "&[data-highlighted]": {
    backgroundColor: "[rgba(0, 0, 0, 0.05)]",
  },
  '&[data-state="checked"]': {
    backgroundColor: "[rgba(0, 0, 0, 0.03)]",
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
  const portalContainerRef = usePortalContainerRef();

  const collection = useMemo(
    () =>
      availablePlaces
        ? createListCollection({
            items: availablePlaces,
            itemToValue: (item) => item.id,
            itemToString: (item) => item.name,
          })
        : null,
    [availablePlaces],
  );

  const nameCellContent = (
    <>
      <div
        className={colorDotStyle}
        style={{ backgroundColor: color ?? "#d4d4d4" }}
      />
      <span className={nameTextStyle}>{placeName}</span>
      <FaChevronDown size={10} className={chevronStyle} />
    </>
  );

  const hasSelect = collection && onPlaceChange && !disabled;

  return (
    <div className={cx(rowStyle, disabled && rowDisabledStyle)}>
      {hasSelect ? (
        <Select.Root
          collection={collection}
          value={[placeId]}
          onValueChange={(details) => {
            const newId = details.value[0];
            if (newId && newId !== placeId) {
              onPlaceChange(newId);
            }
          }}
          positioning={{ sameWidth: true }}
          className={selectRootStyle}
        >
          <Select.Trigger asChild>
            <div className={nameCellStyle}>{nameCellContent}</div>
          </Select.Trigger>
          <Portal container={portalContainerRef}>
            <Select.Positioner>
              <Select.Content className={selectContentStyle}>
                {collection.items.map((item) => (
                  <Select.Item
                    key={item.id}
                    item={item}
                    className={selectItemStyle}
                  >
                    <div
                      className={selectItemDotStyle}
                      style={{
                        backgroundColor: item.color ?? "#d4d4d4",
                      }}
                    />
                    <Select.ItemText>{item.name}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Positioner>
          </Portal>
        </Select.Root>
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
        <input
          type="number"
          value={weight}
          min={1}
          step={1}
          disabled={disabled}
          className={weightInputStyle}
          onChange={(event) => {
            const newWeight = Number.parseInt(event.target.value, 10);
            if (!Number.isNaN(newWeight) && newWeight >= 1) {
              onWeightChange(newWeight);
            }
          }}
        />
        {onDelete && !disabled && (
          <button
            type="button"
            data-arc-delete=""
            className={deleteOverlayStyle}
            onClick={onDelete}
            aria-label="Delete arc"
          >
            <TbTrash size={14} />
          </button>
        )}
      </div>
    </div>
  );
};
