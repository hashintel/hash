import { Combobox, createListCollection } from "@ark-ui/react/combobox";
import { useFilter } from "@ark-ui/react/locale";
import { Portal } from "@ark-ui/react/portal";
import { useState } from "react";

import { Icon, usePortalContainerRef } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { legendContainerStyle } from "./styles";

import type { TimelineSeriesMeta } from "./types";
import type { FC } from "react";

const MAX_RENDERED_OPTIONS = 250;

type LegendComboboxItem = {
  color: string;
  label: string;
  value: string;
};

const legendSelectorStyle = css({
  width: "[100%]",
});

const legendControlStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  position: "relative",
  height: "[30px]",
  width: "[100%]",
  minWidth: "[0]",
  boxSizing: "border-box",
  backgroundColor: "neutral.s00",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "[transparent]",
  borderRadius: "lg",
  paddingX: "1",
  color: "neutral.fg.body",
  _hover: {
    borderColor: "neutral.bd.subtle",
  },
  _focusWithin: {
    borderColor: "neutral.bd.subtle.hover",
    boxShadow: "[0px 0px 0px 2px {colors.neutral.a20}]",
  },
});

const legendSearchAreaStyle = css({
  position: "relative",
  flex: "1",
  minWidth: "[0]",
  height: "[100%]",
});

const selectedNamesStyle = css({
  position: "absolute",
  inset: "[0]",
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "neutral.s100",
  fontSize: "xs",
  fontWeight: "medium",
  lineHeight: "[30px]",
  pointerEvents: "none",
});

const selectedNameItemStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  maxWidth: "[100%]",
  minWidth: "[0]",
  marginRight: "2",
  verticalAlign: "middle",
});

const selectedNameSwatchStyle = css({
  width: "[8px]",
  height: "[8px]",
  borderRadius: "[2px]",
  flexShrink: 0,
});

const selectedNameTextStyle = css({
  minWidth: "[0]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const visuallyHiddenTextStyle = css({
  visibility: "hidden",
});

const selectedCountBadgeStyle = css({
  display: "inline-flex",
  alignItems: "center",
  flexShrink: 0,
  height: "[20px]",
  paddingX: "1.5",
  borderRadius: "md",
  backgroundColor: "neutral.s30",
  color: "neutral.s115",
  fontSize: "[11px]",
  fontWeight: "semibold",
  lineHeight: "[1]",
  whiteSpace: "nowrap",
});

const legendInputStyle = css({
  position: "relative",
  zIndex: "base",
  width: "[100%]",
  height: "[100%]",
  border: "[0]",
  outline: "[0]",
  backgroundColor: "[transparent]",
  color: "neutral.s120",
  fontSize: "xs",
  fontWeight: "medium",
  _placeholder: {
    color: "neutral.s80",
  },
});

const triggerButtonStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: "5",
  height: "5",
  border: "[0]",
  borderRadius: "sm",
  backgroundColor: "[transparent]",
  color: "neutral.s90",
  cursor: "pointer",
  _hover: {
    backgroundColor: "neutral.s20",
    color: "neutral.s120",
  },
});

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
  gridTemplateColumns: "[12px minmax(0, 1fr) auto auto]",
  alignItems: "center",
  gap: "2",
  minHeight: "[34px]",
  padding: "[5px 6px]",
  borderRadius: "md",
  color: "neutral.s115",
  cursor: "pointer",
  outline: "none",
  _highlighted: {
    backgroundColor: "neutral.bg.subtle.hover",
  },
  _selected: {
    color: "neutral.s125",
  },
});

const hiddenItemStyle = css({
  color: "neutral.s85",
});

const itemSwatchStyle = css({
  width: "[10px]",
  height: "[10px]",
  borderRadius: "[2px]",
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
  color: "blue.s90",
});

const emptyStyle = css({
  padding: "2",
  color: "neutral.s85",
  fontSize: "xs",
});

const buildHiddenSeries = (
  series: TimelineSeriesMeta[],
  selectedSeriesIds: string[],
): Set<string> => {
  const selected = new Set(selectedSeriesIds);

  return new Set(
    series
      .filter((item) => !selected.has(item.seriesId))
      .map((item) => item.seriesId),
  );
};

const preventNestedActionSelection = (
  event:
    | React.MouseEvent<HTMLButtonElement>
    | React.PointerEvent<HTMLButtonElement>,
) => {
  event.preventDefault();
  event.stopPropagation();
};

export const TimelineLegend: FC<{
  series: TimelineSeriesMeta[];
  hiddenSeries: Set<string>;
  onHiddenSeriesChange: (hiddenSeries: Set<string>) => void;
}> = ({ series, hiddenSeries, onHiddenSeriesChange }) => {
  const portalContainerRef = usePortalContainerRef();
  const filter = useFilter({ sensitivity: "base" });
  const [inputValue, setInputValue] = useState("");

  const items = series.map((item) => ({
    color: item.color,
    label: item.seriesName,
    value: item.seriesId,
  }));
  const visibleItems = items
    .filter((item) => filter.contains(item.label, inputValue))
    .slice(0, MAX_RENDERED_OPTIONS);
  const collection = createListCollection<LegendComboboxItem>({
    items: visibleItems,
    itemToString: (item) => item.label,
    itemToValue: (item) => item.value,
  });
  const selectedSeriesIds = series
    .filter((item) => !hiddenSeries.has(item.seriesId))
    .map((item) => item.seriesId);
  const selectedSeries = series.filter(
    (item) => !hiddenSeries.has(item.seriesId),
  );
  const selectedCount = selectedSeriesIds.length;

  const toggleSeries = (seriesId: string) => {
    const next = new Set(hiddenSeries);

    if (next.has(seriesId)) {
      next.delete(seriesId);
    } else {
      next.add(seriesId);
    }

    onHiddenSeriesChange(next);
  };

  const selectOnly = (seriesId: string) => {
    onHiddenSeriesChange(
      new Set(
        series
          .filter((item) => item.seriesId !== seriesId)
          .map((item) => item.seriesId),
      ),
    );
  };

  const selectAll = () => {
    onHiddenSeriesChange(new Set());
  };

  const unselectAll = () => {
    onHiddenSeriesChange(new Set(series.map((item) => item.seriesId)));
  };

  return (
    <div className={legendContainerStyle}>
      <Combobox.Root
        className={legendSelectorStyle}
        collection={collection}
        closeOnSelect={false}
        inputValue={inputValue}
        multiple
        onInputValueChange={(details) => setInputValue(details.inputValue)}
        onOpenChange={(details) => {
          if (!details.open) {
            setInputValue("");
          }
        }}
        onValueChange={(details) => {
          onHiddenSeriesChange(buildHiddenSeries(series, details.value));
        }}
        positioning={{ placement: "top-start", sameWidth: false, gutter: 8 }}
        value={selectedSeriesIds}
      >
        <Combobox.Control className={legendControlStyle}>
          <span className={selectedCountBadgeStyle}>
            {selectedCount}/{series.length} shown
          </span>
          <div className={legendSearchAreaStyle}>
            <span
              className={cx(
                selectedNamesStyle,
                inputValue.length > 0 && visuallyHiddenTextStyle,
              )}
            >
              {selectedSeries.map((item) => (
                <span key={item.seriesId} className={selectedNameItemStyle}>
                  <span
                    className={selectedNameSwatchStyle}
                    style={{ backgroundColor: item.color }}
                  />
                  <span className={selectedNameTextStyle}>
                    {item.seriesName}
                  </span>
                </span>
              ))}
            </span>
            {/* TODO(actual-mode follow-up): add explicit accessible names for
            the combobox input and icon-only triggers. The visual selector is
            usable, but screen readers should not rely on a placeholder that
            disappears once timeline series are selected. */}
            <Combobox.Input
              className={legendInputStyle}
              placeholder={
                selectedCount === 0 ? "Search timeline series" : undefined
              }
            />
          </div>
          {inputValue ? (
            <Combobox.ClearTrigger className={triggerButtonStyle}>
              <Icon name="close" size="xxs" />
            </Combobox.ClearTrigger>
          ) : null}
          <Combobox.Trigger className={triggerButtonStyle}>
            <Icon name="chevronDown" size="xs" />
          </Combobox.Trigger>
        </Combobox.Control>
        <Portal container={portalContainerRef}>
          <Combobox.Positioner className={positionerStyle}>
            <Combobox.Content className={contentStyle}>
              <div className={globalActionsStyle}>
                <button
                  type="button"
                  className={actionButtonStyle}
                  disabled={selectedCount === series.length}
                  onClick={selectAll}
                >
                  Select All
                </button>
                <button
                  type="button"
                  className={actionButtonStyle}
                  disabled={selectedCount === 0}
                  onClick={unselectAll}
                >
                  Unselect All
                </button>
              </div>
              <Combobox.Empty className={emptyStyle}>
                No series found.
              </Combobox.Empty>
              <Combobox.List className={listStyle}>
                {collection.items.map((item) => {
                  const isSelected = !hiddenSeries.has(item.value);

                  return (
                    <Combobox.Item
                      key={item.value}
                      item={item}
                      className={cx(itemStyle, !isSelected && hiddenItemStyle)}
                    >
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
                        className={itemActionStyle}
                        onClick={(event) => {
                          preventNestedActionSelection(event);
                          toggleSeries(item.value);
                        }}
                        onPointerDown={preventNestedActionSelection}
                      >
                        {isSelected ? "Unselect" : "Select"}
                      </button>
                      <button
                        type="button"
                        className={cx(itemActionStyle, onlyActionStyle)}
                        onClick={(event) => {
                          preventNestedActionSelection(event);
                          selectOnly(item.value);
                        }}
                        onPointerDown={preventNestedActionSelection}
                      >
                        Only
                      </button>
                    </Combobox.Item>
                  );
                })}
              </Combobox.List>
            </Combobox.Content>
          </Combobox.Positioner>
        </Portal>
      </Combobox.Root>
    </div>
  );
};
