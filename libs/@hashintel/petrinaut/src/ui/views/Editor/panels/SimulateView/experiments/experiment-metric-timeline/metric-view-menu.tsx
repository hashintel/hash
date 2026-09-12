/**
 * A metric chart's view menu, in its card header: an ellipsis button and,
 * while open, a popover with one block per dimension the data can be
 * collapsed along — "Runs" (distribution metrics only) and "Time". Each
 * block switches between drawing everything and aggregating, and offers the
 * list its side has; the popover stays open across choices so the chart
 * behind it re-draws as they are made.
 */
import { useRef, useState } from "react";

import { Button, Popover } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  DISTRIBUTION_VIEW_LABELS,
  RUN_AGGREGATION_LABELS,
  TIME_AGGREGATION_LABELS,
  TIME_TRACE_LABELS,
} from "./describe-metric-view";
import { AggregationDimension } from "./metric-view-menu/aggregation-dimension";

import type { MetricFrame } from "./shared/metric-frames";
import type { MetricViewSettings } from "./view-state";

const bodyStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2.5",
  width: "[312px]",
});

export const MetricViewMenu = ({
  outputType,
  value,
  onChange,
}: {
  outputType: MetricFrame["outputType"];
  value: MetricViewSettings;
  onChange: (settings: MetricViewSettings) => void;
}) => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        ref={triggerRef}
        iconName="ellipsis"
        variant="ghost"
        size="xs"
        aria-label="Chart options"
        tooltip="Chart options"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
      />
      {open ? (
        <Popover
          triggerRef={triggerRef}
          position="bottom-end"
          onClose={() => setOpen(false)}
        >
          <Popover.Container>
            <Popover.Body className={bodyStyle}>
              {outputType === "distribution" ? (
                <AggregationDimension
                  label="Runs"
                  traceLabel="Every run"
                  aggregate={value.aggregateRuns}
                  onAggregateChange={(aggregateRuns) =>
                    onChange({ ...value, aggregateRuns })
                  }
                  traces={DISTRIBUTION_VIEW_LABELS}
                  trace={value.distributionView}
                  onTraceChange={(distributionView) =>
                    onChange({ ...value, distributionView })
                  }
                  statistics={RUN_AGGREGATION_LABELS}
                  statistic={value.runAggregation}
                  onStatisticChange={(runAggregation) =>
                    onChange({ ...value, runAggregation })
                  }
                />
              ) : null}
              <AggregationDimension
                label="Time"
                traceLabel="Every step"
                aggregate={value.aggregateTime}
                onAggregateChange={(aggregateTime) =>
                  onChange({ ...value, aggregateTime })
                }
                traces={TIME_TRACE_LABELS}
                trace={value.timeTrace}
                onTraceChange={(timeTrace) => onChange({ ...value, timeTrace })}
                statistics={TIME_AGGREGATION_LABELS}
                statistic={value.timeAggregation}
                onStatisticChange={(timeAggregation) =>
                  onChange({ ...value, timeAggregation })
                }
              />
            </Popover.Body>
          </Popover.Container>
        </Popover>
      ) : null}
    </>
  );
};
