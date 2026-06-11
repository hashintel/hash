import { Combobox } from "@ark-ui/react/combobox";
import { Portal } from "@ark-ui/react/portal";

import { Icon, usePortalContainerRef } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import type { FC } from "react";

export type LegendComboboxItem = {
  color: string;
  label: string;
  value: string;
};

const positionerStyle = css({
  pointerEvents: "auto",
  zIndex: "popover !important",
});

const contentStyle = css({
  width: "[min(520px, calc(100vw - 32px))]",
  maxHeight: "[min(420px, var(--available-height))]",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  backgroundColor: "neutral.s00",
  borderRadius: "lg",
  boxShadow:
    "[0px 6px 12px -4px rgba(0, 0, 0, 0.12), 0px 2px 4px -1px rgba(0, 0, 0, 0.04), 0px 0px 0px 1px rgba(0, 0, 0, 0.06)]",
  padding: "1",
  outline: "none",
});

const globalActionsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  padding: "1",
  borderBottomWidth: "thin",
  borderColor: "neutral.bd.subtle",
});

const actionButtonStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: "[24px]",
  paddingX: "2",
  border: "[0]",
  borderRadius: "md",
  backgroundColor: "[transparent]",
  color: "neutral.s110",
  cursor: "pointer",
  fontSize: "xs",
  fontWeight: "medium",
  whiteSpace: "nowrap",
  _hover: {
    backgroundColor: "neutral.s20",
    color: "neutral.s125",
  },
  _disabled: {
    color: "neutral.s70",
    cursor: "not-allowed",
    _hover: {
      backgroundColor: "[transparent]",
    },
  },
});

const listStyle = css({
  minHeight: "[0]",
  overflowY: "auto",
  paddingY: "1",
});

const itemStyle = css({
  display: "grid",
  gridTemplateColumns: "[14px 12px minmax(0, 1fr)]",
  alignItems: "center",
  gap: "2",
  position: "relative",
  minHeight: "[34px]",
  padding: "[5px 44px 5px 6px]",
  borderRadius: "md",
  color: "neutral.s115",
  cursor: "pointer",
  outline: "none",
  _highlighted: {
    backgroundColor: "neutral.bg.subtle.hover",
    "& .timelineLegendOnlyAction": {
      opacity: 1,
      pointerEvents: "auto",
    },
  },
  _selected: {
    color: "neutral.s125",
  },
  _focusWithin: {
    "& .timelineLegendOnlyAction": {
      opacity: 1,
      pointerEvents: "auto",
    },
  },
  _hover: {
    "& .timelineLegendOnlyAction": {
      opacity: 1,
      pointerEvents: "auto",
    },
  },
});

const hiddenItemStyle = css({
  color: "neutral.s85",
});

const itemIndicatorStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: "blue.s100",
  "&[hidden]": {
    display: "none",
  },
});

const itemSwatchStyle = css({
  width: "[10px]",
  height: "[10px]",
  borderRadius: "[2px]",
  gridColumn: "[2]",
});

const itemLabelStyle = css({
  minWidth: "[0]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "xs",
  fontWeight: "medium",
});

const itemActionStyle = css({
  height: "[22px]",
  paddingX: "1.5",
  border: "[0]",
  borderRadius: "sm",
  backgroundColor: "[transparent]",
  color: "neutral.s100",
  cursor: "pointer",
  fontSize: "[11px]",
  fontWeight: "medium",
  whiteSpace: "nowrap",
  _hover: {
    backgroundColor: "neutral.s20",
    color: "neutral.s125",
  },
});

const onlyActionStyle = css({
  position: "absolute",
  right: "1.5",
  top: "[50%]",
  transform: "[translateY(-50%)]",
  color: "blue.s90",
  opacity: 0,
  pointerEvents: "none",
});

const emptyStyle = css({
  padding: "2",
  color: "neutral.s85",
  fontSize: "xs",
});

const truncationNoteStyle = css({
  padding: "[6px 8px]",
  borderTopWidth: "thin",
  borderColor: "neutral.bd.subtle",
  color: "neutral.s90",
  fontSize: "[11px]",
});

const preventNestedActionSelection = (
  event:
    | React.MouseEvent<HTMLButtonElement>
    | React.PointerEvent<HTMLButtonElement>,
) => {
  event.preventDefault();
  event.stopPropagation();
};

/**
 * The dropdown half of the timeline series selector: bulk actions, the
 * filtered series list with per-row check indicators and "Only" actions, and
 * a truncation note when the filter matches more rows than are rendered.
 */
export const SeriesDropdown: FC<{
  /** Filtered items actually rendered (capped by the caller). */
  items: LegendComboboxItem[];
  /** How many series matched the filter before the render cap. */
  matchCount: number;
  hiddenSeries: Set<string>;
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onUnselectAll: () => void;
  onSelectOnly: (seriesId: string) => void;
}> = ({
  items,
  matchCount,
  hiddenSeries,
  selectedCount,
  totalCount,
  onSelectAll,
  onUnselectAll,
  onSelectOnly,
}) => {
  const portalContainerRef = usePortalContainerRef();

  return (
    <Portal container={portalContainerRef}>
      <Combobox.Positioner className={positionerStyle}>
        <Combobox.Content className={contentStyle}>
          <div className={globalActionsStyle}>
            <button
              type="button"
              className={actionButtonStyle}
              disabled={selectedCount === totalCount}
              onClick={onSelectAll}
            >
              Select All
            </button>
            <button
              type="button"
              className={actionButtonStyle}
              disabled={selectedCount === 0}
              onClick={onUnselectAll}
            >
              Unselect All
            </button>
          </div>
          <Combobox.Empty className={emptyStyle}>
            No series found.
          </Combobox.Empty>
          <Combobox.List className={listStyle}>
            {items.map((item) => {
              const isSelected = !hiddenSeries.has(item.value);

              return (
                <Combobox.Item
                  key={item.value}
                  item={item}
                  className={cx(itemStyle, !isSelected && hiddenItemStyle)}
                >
                  <Combobox.ItemIndicator className={itemIndicatorStyle}>
                    <Icon name="check" size="xxs" />
                  </Combobox.ItemIndicator>
                  <span
                    className={itemSwatchStyle}
                    style={{
                      backgroundColor: item.color,
                      opacity: isSelected ? 1 : 0.45,
                    }}
                  />
                  <Combobox.ItemText className={itemLabelStyle}>
                    {item.label}
                  </Combobox.ItemText>
                  <button
                    type="button"
                    aria-label={`Show only ${item.label}`}
                    className={cx(
                      itemActionStyle,
                      onlyActionStyle,
                      "timelineLegendOnlyAction",
                    )}
                    onClick={(event) => {
                      preventNestedActionSelection(event);
                      onSelectOnly(item.value);
                    }}
                    onPointerDown={preventNestedActionSelection}
                  >
                    Only
                  </button>
                </Combobox.Item>
              );
            })}
          </Combobox.List>
          {matchCount > items.length && (
            <div className={truncationNoteStyle}>
              Showing {items.length} of {matchCount} series — refine your search
              to see the rest.
            </div>
          )}
        </Combobox.Content>
      </Combobox.Positioner>
    </Portal>
  );
};
