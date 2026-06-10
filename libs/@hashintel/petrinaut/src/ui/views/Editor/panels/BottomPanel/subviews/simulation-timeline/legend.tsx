import { Combobox, createListCollection } from "@ark-ui/react/combobox";
import { useFilter } from "@ark-ui/react/locale";
import { useState } from "react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { SeriesDropdown } from "./legend/series-dropdown";
import { SeriesStrip, useStripLingering } from "./legend/series-strip";
import { legendContainerStyle } from "./styles";

import type { LegendComboboxItem } from "./legend/series-dropdown";
import type { TimelineSeriesMeta } from "./types";
import type { FC } from "react";

const MAX_RENDERED_OPTIONS = 250;

// Hoisted so `useFilter`'s memo (keyed on its props object) stays stable and
// the filtered collection is only rebuilt when the series or query change.
const FILTER_OPTIONS = { sensitivity: "base" } as const;

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
  fontVariantNumeric: "tabular-nums",
  fontWeight: "semibold",
  lineHeight: "[1]",
  whiteSpace: "nowrap",
});

const legendInputStyle = css({
  position: "relative",
  zIndex: "[0]",
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

/**
 * Selector for the timeline chart's series: a collapsed strip of the visible
 * series (with hover actions to hide them) plus a searchable multi-select
 * dropdown for managing everything.
 *
 * `hiddenSeries` is the inverse of the combobox selection — the chart reads
 * hidden ids, the combobox speaks in selected values, and this component
 * translates at the boundary.
 */
export const TimelineLegend: FC<{
  series: TimelineSeriesMeta[];
  hiddenSeries: Set<string>;
  onHiddenSeriesChange: (hiddenSeries: Set<string>) => void;
}> = ({ series, hiddenSeries, onHiddenSeriesChange }) => {
  const filter = useFilter(FILTER_OPTIONS);
  const [inputValue, setInputValue] = useState("");
  const lingering = useStripLingering(hiddenSeries);

  const items: LegendComboboxItem[] = series.map((item) => ({
    color: item.color,
    label: item.seriesName,
    value: item.seriesId,
  }));
  const matchingItems = items.filter((item) =>
    filter.contains(item.label, inputValue),
  );
  const visibleItems = matchingItems.slice(0, MAX_RENDERED_OPTIONS);
  const collection = createListCollection<LegendComboboxItem>({
    items: visibleItems,
    itemToString: (item) => item.label,
    itemToValue: (item) => item.value,
  });
  const selectedSeriesIds = series
    .filter((item) => !hiddenSeries.has(item.seriesId))
    .map((item) => item.seriesId);
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
        openOnClick
        positioning={{ placement: "top-start", sameWidth: false, gutter: 8 }}
        value={selectedSeriesIds}
      >
        <Combobox.Control
          className={legendControlStyle}
          // Just-toggled strip entries linger until the pointer or focus has
          // left the whole selector for a grace period, so several can be
          // toggled in a row and a quick return keeps them in place.
          onPointerEnter={lingering.cancelRelease}
          onPointerLeave={lingering.scheduleRelease}
          onFocus={lingering.cancelRelease}
          onBlur={(event) => {
            if (
              !event.currentTarget.contains(event.relatedTarget as Node | null)
            ) {
              lingering.scheduleRelease();
            }
          }}
        >
          <span className={selectedCountBadgeStyle}>
            {selectedCount}/{series.length} shown
          </span>
          <div className={legendSearchAreaStyle}>
            <SeriesStrip
              series={series}
              hiddenSeries={hiddenSeries}
              isSearching={inputValue.length > 0}
              lingering={lingering}
              onToggleSeries={toggleSeries}
            />
            <Combobox.Input
              aria-label="Filter timeline series"
              className={legendInputStyle}
            />
          </div>
          {inputValue ? (
            // Deliberately not Combobox.ClearTrigger: that part clears the
            // *selection* as well as the input, which would hide every series.
            <button
              type="button"
              aria-label="Clear search"
              className={triggerButtonStyle}
              onClick={() => setInputValue("")}
            >
              <Icon name="close" size="xxs" />
            </button>
          ) : null}
          <Combobox.Trigger
            aria-label="Toggle series list"
            className={triggerButtonStyle}
          >
            <Icon name="chevronDown" size="xs" />
          </Combobox.Trigger>
        </Combobox.Control>
        <SeriesDropdown
          items={visibleItems}
          matchCount={matchingItems.length}
          hiddenSeries={hiddenSeries}
          selectedCount={selectedCount}
          totalCount={series.length}
          onSelectAll={selectAll}
          onUnselectAll={unselectAll}
          onSelectOnly={selectOnly}
        />
      </Combobox.Root>
    </div>
  );
};
