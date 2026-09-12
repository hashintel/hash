/**
 * @layerRoot ui.views.editor.results
 * @role The one results surface the experiment drawer renders from a view-model: the header stats, the parameter card, the surface, the metric cards and the footer in the shared frame, with the study's headline, columns, cards and steps filled in once a sweep has one
 *
 * The view renders a `ResultsModel` and nothing else: it reads no record and
 * no provider. The adapter that builds the model lives beside the record it
 * reads; the members only a sweep with a study has (the headline, its
 * step columns, the Constraints and Sensitivity cards, the steps table)
 * arrive filled in or empty, and the view lays them out the same way.
 */
import { Tooltip } from "@hashintel/ds-components";

import { ComputeBackendBadge } from "./compute-backend-badge";
import {
  ComputeBatchesChip,
  DrawerFrame,
  type DrawerFrameProps,
  FrameCard,
  FrameColumns,
  FrameStat,
  FrameStatusPill,
} from "./drawer-frame";
import { MetricTiles } from "./metric-tiles";

import type { ResultsHeader, ResultsModel, ResultsStat } from "./results-model";

const StatValue = ({ value }: { value: ResultsStat["value"] }) =>
  value.tooltip === undefined ? (
    value.text
  ) : (
    <Tooltip content={value.tooltip} position="bottom-start">
      <span>{value.text}</span>
    </Tooltip>
  );

/** The strip: the status pill, the columns in order, the computing chip. */
const ResultsStats = ({ header }: { header: ResultsHeader }) => (
  <>
    <FrameStat label="Status" widest="" align="start">
      <FrameStatusPill tone={header.status.tone} widest={header.status.widest}>
        {header.status.label}
      </FrameStatusPill>
    </FrameStat>
    {header.stats.map((stat) => (
      <FrameStat
        key={stat.id}
        label={stat.label}
        widest={stat.widest}
        short={stat.short}
      >
        <StatValue value={stat.value} />
      </FrameStat>
    ))}
    {header.activity === null ? null : (
      <FrameStat label="Activity" widest="" align="start">
        <ComputeBatchesChip batches={header.activity} />
      </FrameStat>
    )}
  </>
);

export const ResultsView = ({
  model,
  drawer,
}: {
  model: ResultsModel;
  /** Given, the view renders inside a ds `Drawer`; otherwise it fills its section. */
  drawer?: DrawerFrameProps["drawer"];
}) => {
  const { header, bands, surface, metrics, after, footer, footerSecondary } =
    model;

  return (
    <DrawerFrame
      drawer={drawer}
      title={header.title}
      headline={header.headline}
      stats={<ResultsStats header={header} />}
      badge={
        header.compute === null ? null : (
          <ComputeBackendBadge backend={header.compute} />
        )
      }
      progress={header.progress}
      note={header.note}
      footer={footer}
      footerSecondary={footerSecondary}
    >
      {bands.map((band) => (
        <FrameCard
          key={band.id}
          title={band.title}
          subtitle={band.subtitle}
          help={band.help}
          trailing={band.trailing}
          more={band.more}
          tone={band.tone}
        >
          {band.content}
          {band.below}
        </FrameCard>
      ))}
      <FrameColumns
        primary={surface}
        secondary={
          metrics === null ? null : (
            <MetricTiles
              key={metrics.key}
              tiles={metrics.tiles}
              timeDomain={metrics.timeDomain}
              contentEpoch={metrics.contentEpoch}
              plotHeight={metrics.plotHeight}
              tone={metrics.tone}
            >
              {metrics.cards}
            </MetricTiles>
          )
        }
        after={after}
      />
    </DrawerFrame>
  );
};
