---
layer: ui.views.editor.bottom-panel.timeline
role: Charts a run over time in the bottom panel, with a ruler to scrub the run and a legend to hide series
---

The timeline is the chart of the Timeline tab. It draws the series of the view the user picked: tokens per place, per type or per transition, a metric, or the error of the solver.

## Interface

Other blocks import the entry files:

| File                          | Export                       | What it is                                                                                                                          |
| ----------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `run-timeline.tsx`            | `EventTimeline`              | The timeline of a run the editor started, drawn from its event trace, or of a Stochastic simulation. The tab `simulation-timeline`. |
| `actual-timeline.tsx`         | `ActualTimeline`             | The timeline of the frames a host streams in Actual mode. The tab `actual-timeline`.                                                |
| `timeline-header-actions.tsx` | `EventTimelineHeaderActions` | The view picker and the chart type selector that the tab of a run adds to the header of the panel.                                  |

The [preview](layer:ui.preview) mounts `EventTimeline` and `ActualTimeline`. The id of a tab is stored with the user's settings, so the ids keep their names whatever the files are called.

Each entry has a folder of its name with its own parts, and `shared/` holds what the entries share: the legend, the styles, the tooltip and the view to draw.

## Protocol

**The series extractor.** A view is a `TimelineSeriesConfig`: the series to plot and one `TimelineSeriesExtractor`, which returns the value of one series in one frame, or `NaN` for a gap. `shared/types.ts` states the contract and `shared/series-config.ts` picks the config of the view. Both timelines read through it, so a new view is one builder in `shared/series-config/` and one case in `shared/series-config.ts`. The builders are private to that file: a timeline that needs a name of one reads it from `shared/series-config.ts`.

**The series store of a run.** `run-timeline/series-store.ts` keeps the columns of a run and appends to them as events arrive. Its header states what is read once and which cells are read again. The header of `run-timeline/series.ts` states the shapes the columns take.

## Rules

| Rule                                                                                       | Reason                                                                         | Held by                                |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | -------------------------------------- |
| The store reads an event once and reads again only the cells past the last recorded event. | A batch then costs the events it brought and never the whole run.              | `run-timeline/series-store.test.ts`    |
| The zoom of a run's timeline outlives the tab.                                             | A tab unmounts when another is picked, and the user returns to the same span.  | `run-timeline/use-view-range.test.tsx` |
| A pick that Actual mode has no data for draws tokens per place.                            | A host reports token counts only: it evaluates no metric and records no error. | `actual-timeline.test.tsx`             |
