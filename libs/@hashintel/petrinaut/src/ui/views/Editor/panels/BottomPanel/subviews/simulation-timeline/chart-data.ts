/**
 * The columns uPlot draws, extended as frames arrive rather than rebuilt.
 *
 * A run appends one row per frame, and the chart is asked for its data again
 * on every one of them. Building that data from scratch each time costs a
 * pass over the whole run: on a net with five hundred series, a thousand
 * frames in, moving the chart on by one column meant half a million
 * additions and five hundred fresh arrays. Rows are only ever appended, so
 * both builders keep what they made and extend it, and start over only when
 * the shape they were built from changes — a different series list, a
 * different hidden set, or a new run.
 *
 * Each builder holds the state for one chart, so a chart makes its own.
 */

import type { StreamingStore, TimelineSeriesMeta } from "./types";
import type uPlot from "uplot";

type Source = {
  time: number[];
  series: TimelineSeriesMeta[];
  hidden: Set<string>;
};

const sameSource = (
  previous: Source | null,
  store: StreamingStore,
  hidden: Set<string>,
): previous is Source =>
  previous !== null &&
  previous.time === store.columns[0] &&
  previous.series === store.series &&
  previous.hidden === hidden;

/**
 * Builds the plain (unstacked) data: the time column, then one column per
 * series. A hidden series is plotted as gaps, and every hidden series shares
 * one column of them.
 */
export const createRunDataBuilder = (): ((
  store: StreamingStore,
  hiddenSeries: Set<string>,
  length?: number,
) => uPlot.AlignedData) => {
  let source: Source | null = null;
  let gaps: null[] = [];
  let data: uPlot.AlignedData = [[]];

  return (store, hiddenSeries, length = store.length) => {
    if (!sameSource(source, store, hiddenSeries)) {
      source = {
        time: store.columns[0]!,
        series: store.series,
        hidden: hiddenSeries,
      };
      gaps = [];
      data = [
        store.columns[0]!,
        ...store.series.map((series, index) =>
          hiddenSeries.has(series.seriesId) ? gaps : store.columns[index + 1]!,
        ),
      ] as uPlot.AlignedData;
    }

    while (gaps.length < length) {
      gaps.push(null);
    }

    return data;
  };
};

/**
 * Builds the stacked data: each band is its series plus everything below it,
 * ordered from the top down, which is the order uPlot fills bands in.
 */
export const createStackedDataBuilder = (): ((
  store: StreamingStore,
  hiddenSeries: Set<string>,
  length?: number,
) => uPlot.AlignedData) => {
  let source: Source | null = null;
  let built = 0;
  let visibleColumns: number[] = [];
  let bands: number[][] = [];
  let data: uPlot.AlignedData = [[]];

  return (store, hiddenSeries, length = store.length) => {
    if (!sameSource(source, store, hiddenSeries) || length < built) {
      source = {
        time: store.columns[0]!,
        series: store.series,
        hidden: hiddenSeries,
      };
      built = 0;
      visibleColumns = store.series
        .map((series, index) => ({ series, column: index + 1 }))
        .filter(({ series }) => !hiddenSeries.has(series.seriesId))
        .map(({ column }) => column);
      bands = visibleColumns.map(() => []);
      data = [
        store.columns[0]!,
        ...[...bands].reverse(),
      ] as unknown as uPlot.AlignedData;
    }

    for (let row = built; row < length; row++) {
      let total = 0;
      for (let band = 0; band < visibleColumns.length; band++) {
        total += store.columns[visibleColumns[band]!]![row] ?? 0;
        bands[band]![row] = total;
      }
    }

    built = length;

    return data;
  };
};
