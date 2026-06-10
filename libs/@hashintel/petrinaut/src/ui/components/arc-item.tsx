import { useMemo } from "react";

import {
  Button,
  NumberInput,
  Select,
  type SelectItem,
} from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import type { ReactNode } from "react";

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
  display: "flex",
  alignItems: "center",
  justifyItems: "center",
  justifyContent: "center",
  position: "relative",
  "& [data-arc-delete]": {
    width: "0",
    opacity: "0",
    transition: "[width 150ms ease, opacity 150ms ease]",
  },
  "&:hover [data-arc-delete]": {
    width: "7",
    opacity: "1",
  },
});

const readOnlyStyle = css({
  flexGrow: "1",
  marginRight: "4",
});

const weightInputStyle = css({
  width: "[54px]",
});

const deleteContainerStyle = css({
  overflow: "hidden",
  flexShrink: 0,
  height: "[100%]",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});

const arcStyle = css({
  display: "flex",
  gap: "2",
  alignItems: "center",
});

const arcDotStyle = css({
  width: "[12px]",
  height: "[12px]",
  borderRadius: "[50%]",
  flexShrink: 0,
});

// -- Component ---------------------------------------------------------------

interface ArcItemProps {
  placeId: string;
  weight: number;
  disabled?: boolean;
  availablePlaces?: PlaceOption[];
  onPlaceChange?: (placeId: string) => void;
  onWeightChange: (weight: number) => void;
  onDelete?: () => void;
}

export const ArcItem = ({
  placeId,
  weight,
  disabled = false,
  availablePlaces,
  onPlaceChange,
  onWeightChange,
  onDelete,
}: ArcItemProps) => {
  const selectOptions: SelectItem<string>[] = useMemo(
    () =>
      availablePlaces?.map((pl) => ({
        value: pl.id,
        text: pl.name,
      })) ?? [],
    [availablePlaces],
  );

  const hasSelect = availablePlaces && onPlaceChange && !disabled;

  return (
    <div className={cx(rowStyle)}>
      <Select
        required
        size="sm"
        connectToRightInput
        className={cx(!hasSelect && readOnlyStyle)}
        readonly={!hasSelect}
        disabled={disabled}
        value={placeId}
        onChange={(newId) => {
          if (newId !== placeId) {
            onPlaceChange?.(newId);
          }
        }}
        items={selectOptions}
        renderItem={(value) => {
          const place = availablePlaces?.find((pl) => pl.id === value);
          return (
            <div className={arcStyle}>
              <div
                className={arcDotStyle}
                style={{
                  backgroundColor: place?.color ?? "#d4d4d4",
                }}
              />
              {place?.name ?? value}
            </div>
          );
        }}
      />
      <NumberInput
        type="integer"
        value={weight}
        min={1}
        step={1}
        disabled={disabled}
        size="sm"
        connectToLeftInput={hasSelect}
        className={weightInputStyle}
        onChange={(newWeight) => {
          if (newWeight !== null && newWeight >= 1) {
            onWeightChange(newWeight);
          }
        }}
      />
      {onDelete && !disabled && (
        <div data-arc-delete="" className={deleteContainerStyle}>
          <Button
            variant="ghost"
            tone="error"
            size="xs"
            onClick={onDelete}
            aria-label="Delete arc"
            tooltip="Delete arc"
            iconName="trash"
          />
        </div>
      )}
    </div>
  );
};
