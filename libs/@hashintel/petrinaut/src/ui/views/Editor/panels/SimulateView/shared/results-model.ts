/**
 * What a results surface shows, as plain data: the view-model `ResultsView`
 * renders for an experiment, with or without a study driving its sweep. The
 * adapter (`experimentResultsModel`) maps a record onto it; the view knows
 * no record. What a study adds is data and a few extra panels, so the panels
 * only a study has are optional members the adapter fills once one exists.
 */
import type { ChartCardTone } from "./chart-card";
import type { ComputeBackendSummary } from "./compute-backend-badge";
import type {
  ComputeBatch,
  FrameCardMore,
  FrameNote,
  FrameStatShort,
  FrameStatusTone,
} from "./drawer-frame";
import type { MetricTile } from "./metric-tiles";
import type { ReactNode } from "react";

/** The status pill: the word, its tone, and the longest word it can become. */
export type ResultsStatus = {
  label: string;
  tone: FrameStatusTone;
  /** The longest status word, so the pill keeps its width across statuses. */
  widest: string;
};

/**
 * One stat column's value: the text, with the tooltip that explains it when
 * there is one. A leaf element may stand in for the text so a readout that
 * ticks on its own (the wall clock) re-renders alone.
 */
export type ResultsStatValue = {
  text: ReactNode;
  tooltip?: string;
};

/** One labelled column of the header strip, as wide as its widest value. */
export type ResultsStat = {
  id: string;
  label: string;
  value: ResultsStatValue;
  /** The widest text the value can show; it sizes the column invisibly. */
  widest: string;
  /** A shorter form for a narrow header, with its own widest text; absent, the value shows whole. */
  short?: FrameStatShort;
};

export type ResultsHeader = {
  /** One line: `SIR transmission sweep · Seasonal Flu · 100 runs`. */
  title: string;
  /** The title line's right side while at rest: a study's progress line. */
  headline: ReactNode | null;
  status: ResultsStatus;
  /** The columns after the status pill, in order. */
  stats: readonly ResultsStat[];
  /** The batches computing now; null leaves the Activity column out. */
  activity: readonly ComputeBatch[] | null;
  /** The backend the record ran on; null leaves the Compute column out. */
  compute: ComputeBackendSummary | null;
  /** The bar along the header's bottom edge, 0 to 100. */
  progress: number;
  /** The reserved row under the header; null keeps the row empty. */
  note: FrameNote | null;
};

/**
 * A titled card across the body, above the columns: the parameter controls.
 * `more` is a part the card keeps folded away behind a footer button, the
 * parameters held fixed; null gives the card no footer.
 */
export type ResultsBand = {
  /** The band's key; it carries the record's id so a fold never survives an in-place swap to another record. */
  id: string;
  title: string;
  /** One line under the title: what the card holds, e.g. `2 optimized · 3 fixed`. */
  subtitle: string;
  help?: string;
  /** The header's right side: a state line, a switch. */
  trailing: ReactNode | null;
  content: ReactNode;
  /** Under the controls, spanning the body: a sweep's objective by step. Null gives the card nothing there. */
  below: ReactNode | null;
  more: FrameCardMore | null;
  /** The card's look: `optimizing` while an optimizer drives its controls. */
  tone: ChartCardTone;
};

/** The metric cards grid: the timelines, then whatever cards follow them, all one height. */
export type ResultsMetrics = {
  /** Identity of the grid's view state; a change resets every card's view choice. */
  key: string;
  tiles: readonly MetricTile[];
  timeDomain: readonly [number, number];
  /**
   * Identity of what the frames represent (a selection key). A change fades
   * the previous picture out inside each plot instead of cutting to the
   * sparse new stream.
   */
  contentEpoch: string;
  /** The plot's height inside every card; the grid's row height follows. */
  plotHeight: number;
  tone: ChartCardTone;
  /** Cards after the timelines, in the same grid: a study's objective by step, constraints, importance. */
  cards: ReactNode | null;
};

export type ResultsModel = {
  header: ResultsHeader;
  /** Cards across the body, above the columns, in order. */
  bands: readonly ResultsBand[];
  /** The surface card, in the primary column; null gives the cards the width. */
  surface: ReactNode | null;
  /** The metric cards grid, in the secondary column. */
  metrics: ResultsMetrics | null;
  /** Full width beneath the columns: a study's steps table. */
  after: ReactNode | null;
  /** The footer's actions, pinned right. */
  footer: ReactNode;
  /** The footer's left side: the controls that stay whatever the status; null leaves it empty. */
  footerSecondary: ReactNode | null;
};
