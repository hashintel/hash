/* eslint-disable canonical/filename-no-index -- directory entry point */
import { useMemo, useState, type KeyboardEvent } from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

import { SegmentedControl } from "../../../shared/segmented-control";
import { trackSupplyChainInteraction } from "../../../shared/telemetry";
import {
  campaignKey,
  deriveScheduleModel,
  type ScheduleFilters,
  type ScheduleQuantity,
} from "./model";

import type {
  ProductionSchedule,
  ProductionScheduleBatch,
  ProductionScheduleStatus,
} from "../../../shared/production-schedule-types";

const DAY_MS = 86_400_000;
const LABEL_WIDTH = 220;
const AXIS_HEIGHT = 42;
const LANE_HEIGHT = 86;

type RangePreset = "3m" | "6m" | "12m" | "all" | "custom";
type Granularity = "batch" | "campaign";

const root = css({
  display: "flex",
  flexDirection: "column",
  h: "full",
  minH: "0",
  gap: "3",
});
const toolbar = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "end",
  gap: "2",
  p: "3",
  borderWidth: "1px",
  borderColor: "bd.subtle",
  borderRadius: "md",
  bg: "bg.surface",
});
const field = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  textStyle: "xs",
  color: "fg.subtle",
});
const control = css({
  h: "8",
  minW: "28",
  px: "2",
  borderWidth: "1px",
  borderColor: "bd.subtle",
  borderRadius: "sm",
  bg: "bg.surface",
  color: "fg.heading",
  textStyle: "xs",
});
const smallControl = css({ minW: "20", w: "20" });
const dateControl = css({ minW: "32" });
const kpiRow = css({
  display: "flex",
  gap: "2",
  flexWrap: "wrap",
});
const kpi = css({
  px: "3",
  py: "2",
  borderWidth: "1px",
  borderColor: "bd.subtle",
  borderRadius: "md",
  bg: "bg.surface",
  textStyle: "xs",
  color: "fg.subtle",
});
const kpiValue = css({
  display: "block",
  textStyle: "base",
  fontWeight: "semibold",
  color: "fg.heading",
});
const legend = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "3",
  textStyle: "xs",
  color: "fg.subtle",
});
const legendItem = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
});
const swatch = css({
  display: "inline-block",
  w: "4",
  h: "3",
  borderWidth: "1px",
  borderColor: "bd.strong",
  borderRadius: "xs",
});
const selectedSwatch = css({ bg: "[#2563eb]" });
const sharedSwatch = css({ bg: "[#7c3aed]", borderColor: "[#6d28d9]" });
const unresolvedSwatch = css({
  bg: "[#d97706]",
  borderColor: "[#b45309]",
  borderStyle: "dashed",
});
const hatchSwatch = css({
  backgroundImage:
    "[repeating-linear-gradient(135deg, transparent, transparent 3px, currentColor 3px, currentColor 4px)]",
});
const chartFrame = css({
  flex: "1",
  minH: "56",
  overflow: "auto",
  borderWidth: "1px",
  borderColor: "bd.subtle",
  borderRadius: "md",
  bg: "bg.surface",
});
const empty = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minH: "56",
  textStyle: "sm",
  color: "fg.subtle",
});
const clickTarget = css({
  cursor: "pointer",
  _focusVisible: { outline: "2px solid" },
});

const parseDay = (date: string): number =>
  Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
const formatDay = (day: number): string =>
  new Date(day * DAY_MS).toISOString().slice(0, 10);
const formatQuantity = (value: number): string =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
const formatQuantityBreakdown = (rows: ScheduleQuantity[]): string =>
  rows.length === 0
    ? "0"
    : rows
        .map(
          ({ name, value, uom }) =>
            `${name}: ${[formatQuantity(value), uom].filter(Boolean).join(" ")}`,
        )
        .join(" · ");

const subtractMonths = (date: string, months: number): string => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() - months);
  return value.toISOString().slice(0, 10);
};

const batchTooltip = (batch: ProductionScheduleBatch): string =>
  [
    `Batch ${batch.batch ?? "unknown"} · ${batch.order}`,
    `${batch.start} – ${batch.end} (${batch.span_days}d)`,
    `Output: ${
      batch.quantity == null ? "unknown" : formatQuantity(batch.quantity)
    } ${batch.uom ?? ""}`,
    ...(batch.allocation_overage_quantity &&
    batch.allocation_overage_quantity > batch.allocation_tolerance
      ? [
          `Data quality: net consumption exceeds confirmed output by ${formatQuantity(batch.allocation_overage_quantity)} ${batch.uom ?? ""}`,
        ]
      : []),
    `Provenance: ${batch.start_source} → ${batch.finish_source} (${batch.derivation})`,
    ...batch.allocations.map(
      (allocation) =>
        `${allocation.status}: ${formatQuantity(allocation.net_quantity)} · ${
          allocation.confidence
        } · ${allocation.reason}${
          allocation.output_candidates.length > 0
            ? ` · outputs ${allocation.output_candidates
                .map(
                  (candidate) =>
                    `${candidate.batch ?? candidate.order} (${candidate.product_relation})`,
                )
                .join(", ")}`
            : ""
        }`,
    ),
  ].join("\n");

const allocationColor: Record<ProductionScheduleStatus, string> = {
  selected: "#2563eb",
  shared: "#7c3aed",
  other: "#94a3b8",
  open: "#64748b",
  unresolved: "#d97706",
};

export const ProductionScheduleView = ({
  schedule,
  onStepSelect,
  stepIdByMaterial,
}: {
  schedule: ProductionSchedule;
  onStepSelect: (stepId: string) => void;
  stepIdByMaterial: ReadonlyMap<string, string>;
}) => {
  const artifactDates = schedule.lanes.flatMap((lane) =>
    lane.batches.flatMap((batch) => [batch.start, batch.end]),
  );
  const artifactStart =
    artifactDates.length > 0
      ? artifactDates.reduce((min, date) => (date < min ? date : min))
      : null;
  const artifactEnd =
    artifactDates.length > 0
      ? artifactDates.reduce((max, date) => (date > max ? date : max))
      : null;
  const [preset, setPreset] = useState<RangePreset>("all");
  const [customStart, setCustomStart] = useState(artifactStart ?? "");
  const [customEnd, setCustomEnd] = useState(artifactEnd ?? "");
  const [role, setRole] = useState<ScheduleFilters["role"]>("all");
  const [material, setMaterial] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<string | null>(null);
  const [status, setStatus] = useState<ScheduleFilters["status"]>("all");
  const [granularity, setGranularity] = useState<Granularity>("batch");
  const [minGapDays, setMinGapDays] = useState(1);
  const [pixelsPerDay, setPixelsPerDay] = useState(8);
  const [selectedFgBatch, setSelectedFgBatch] = useState<string | null>(null);
  const trackScheduleInteraction = (interaction: string) =>
    trackSupplyChainInteraction({
      interaction,
      productId: schedule.product_id,
      source: "production_schedule",
    });

  const selectedRange = useMemo(() => {
    if (!artifactEnd || preset === "all") {
      return { start: null, end: null };
    }
    if (preset === "custom") {
      return {
        start: customStart || null,
        end: customEnd || null,
      };
    }
    return {
      start: subtractMonths(
        artifactEnd,
        { "3m": 3, "6m": 6, "12m": 12 }[preset],
      ),
      end: artifactEnd,
    };
  }, [artifactEnd, customEnd, customStart, preset]);

  const model = useMemo(
    () =>
      deriveScheduleModel(
        schedule,
        {
          ...selectedRange,
          material,
          role,
          campaign,
          status: granularity === "campaign" ? "all" : status,
          minGapDays,
        },
        selectedFgBatch,
      ),
    [
      campaign,
      granularity,
      material,
      minGapDays,
      role,
      schedule,
      selectedFgBatch,
      selectedRange,
      status,
    ],
  );

  const campaigns = useMemo(
    () =>
      [
        ...new Set(
          schedule.lanes.flatMap((lane) =>
            lane.campaigns
              .map((campaignRow) => campaignKey(campaignRow))
              .filter((value): value is string => Boolean(value)),
          ),
        ),
      ].sort(),
    [schedule.lanes],
  );

  const startDay = model.start ? parseDay(model.start) : 0;
  const endDay = model.end ? parseDay(model.end) : startDay;
  const dayCount = Math.max(1, endDay - startDay + 1);
  const plotWidth = Math.max(720, dayCount * pixelsPerDay);
  const svgWidth = LABEL_WIDTH + plotWidth;
  const svgHeight = AXIS_HEIGHT + model.lanes.length * LANE_HEIGHT;
  const xForDate = (date: string) =>
    LABEL_WIDTH + (parseDay(date) - startDay) * (plotWidth / dayCount);
  const widthForDays = (days: number) =>
    Math.max(3, days * (plotWidth / dayCount));
  const ticks = Array.from(
    {
      length: Math.ceil(dayCount / Math.max(1, Math.round(80 / pixelsPerDay))),
    },
    (_, index) => startDay + index * Math.max(1, Math.round(80 / pixelsPerDay)),
  ).filter((day) => day <= endDay);

  const kpis = [
    ["Campaigns", model.kpis.campaigns],
    ["Batches", model.kpis.batches],
    ["Recorded active days", model.kpis.activeDays ?? "—"],
    [
      "Median gap",
      model.kpis.medianGapDays == null ? "—" : `${model.kpis.medianGapDays}d`,
    ],
    [
      "Longest gap",
      model.kpis.longestGapDays == null ? "—" : `${model.kpis.longestGapDays}d`,
    ],
    [
      "Longest run",
      model.kpis.longestRunDays == null ? "—" : `${model.kpis.longestRunDays}d`,
    ],
    ["Selected qty", formatQuantityBreakdown(model.kpis.selectedQuantity)],
    ["Shared qty", formatQuantityBreakdown(model.kpis.sharedQuantity)],
    ["Open qty", formatQuantityBreakdown(model.kpis.openQuantity)],
  ] as const;

  return (
    <section className={root} aria-label="Production cadence schedule">
      <div className={toolbar}>
        <label className={field}>
          Range
          <select
            className={control}
            value={preset}
            onChange={(event) => {
              setPreset(event.target.value as RangePreset);
              trackScheduleInteraction("production_schedule_filter_changed");
            }}
          >
            <option value="3m">3 months</option>
            <option value="6m">6 months</option>
            <option value="12m">12 months</option>
            <option value="all">All</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        {preset === "custom" && (
          <>
            <label className={field}>
              From
              <input
                className={cx(control, dateControl)}
                type="date"
                value={customStart}
                max={customEnd || undefined}
                onChange={(event) => {
                  setCustomStart(event.target.value);
                  trackScheduleInteraction(
                    "production_schedule_filter_changed",
                  );
                }}
              />
            </label>
            <label className={field}>
              To
              <input
                className={cx(control, dateControl)}
                type="date"
                value={customEnd}
                min={customStart || undefined}
                onChange={(event) => {
                  setCustomEnd(event.target.value);
                  trackScheduleInteraction(
                    "production_schedule_filter_changed",
                  );
                }}
              />
            </label>
          </>
        )}
        <label className={field}>
          Role
          <select
            className={control}
            value={role}
            onChange={(event) => {
              setRole(event.target.value as ScheduleFilters["role"]);
              setMaterial(null);
              trackScheduleInteraction("production_schedule_filter_changed");
            }}
          >
            <option value="all">All roles</option>
            <option value="finished_good">Finished good</option>
            <option value="intermediate">Intermediate</option>
          </select>
        </label>
        <label className={field}>
          Material
          <select
            className={control}
            value={material ?? ""}
            onChange={(event) => {
              setMaterial(event.target.value || null);
              trackScheduleInteraction("production_schedule_filter_changed");
            }}
          >
            <option value="">All materials</option>
            {schedule.lanes
              .filter((lane) => role === "all" || lane.role === role)
              .map((lane) => (
                <option key={lane.material} value={lane.material}>
                  {lane.name}
                </option>
              ))}
          </select>
        </label>
        <label className={field}>
          Campaign
          <select
            className={control}
            value={campaign ?? ""}
            onChange={(event) => {
              setCampaign(event.target.value || null);
              trackScheduleInteraction("production_schedule_filter_changed");
            }}
          >
            <option value="">All campaigns</option>
            {campaigns.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className={field}>
          Status
          <select
            className={control}
            value={status}
            disabled={granularity === "campaign"}
            title={
              granularity === "campaign"
                ? "Allocation status applies to batch windows, not daily cadence."
                : undefined
            }
            onChange={(event) => {
              setStatus(event.target.value as ScheduleFilters["status"]);
              trackScheduleInteraction("production_schedule_filter_changed");
            }}
          >
            <option value="all">All statuses</option>
            {(
              ["selected", "shared", "other", "open", "unresolved"] as const
            ).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className={field}>
          Min gap
          <input
            className={cx(control, smallControl)}
            type="number"
            min={1}
            max={365}
            value={minGapDays}
            onChange={(event) => {
              setMinGapDays(Math.max(1, Number(event.target.value) || 1));
              trackScheduleInteraction("production_schedule_filter_changed");
            }}
          />
        </label>
        <label className={field}>
          Zoom
          <input
            aria-label="Timeline zoom"
            type="range"
            min={3}
            max={28}
            value={pixelsPerDay}
            onChange={(event) => setPixelsPerDay(Number(event.target.value))}
            onPointerUp={() => {
              trackScheduleInteraction("production_schedule_zoom_changed");
            }}
            onKeyUp={() => {
              trackScheduleInteraction("production_schedule_zoom_changed");
            }}
          />
        </label>
        <SegmentedControl
          value={granularity}
          onChange={(nextGranularity) => {
            setGranularity(nextGranularity);
            trackScheduleInteraction("production_schedule_granularity_changed");
          }}
          options={[
            { value: "batch", label: "Batches" },
            { value: "campaign", label: "Daily cadence" },
          ]}
        />
      </div>

      <div className={kpiRow} aria-label="Schedule key metrics">
        {kpis.map(([label, value]) => (
          <div key={label} className={kpi}>
            <span className={kpiValue}>{value}</span>
            {label}
          </div>
        ))}
      </div>

      <div className={legend} aria-label="Schedule legend">
        <span className={legendItem}>
          <span className={cx(swatch, selectedSwatch)} /> Selected
        </span>
        <span className={legendItem}>
          <span className={cx(swatch, sharedSwatch)} /> Shared (+ marker)
        </span>
        <span className={legendItem}>
          <span className={cx(swatch, hatchSwatch)} /> Open / other hatch
        </span>
        <span className={legendItem}>
          <span className={cx(swatch, unresolvedSwatch)} /> Unresolved
        </span>
        <span>Solid outline: exact lineage · dashed: candidate lineage</span>
        <span>Bottom strip: quantity allocation</span>
      </div>

      {model.lanes.length === 0 || !model.start || !model.end ? (
        <div className={empty}>
          No schedule events match these filters. Schedule data may be sparse
          for this period.
        </div>
      ) : (
        <div
          className={chartFrame}
          role="region"
          aria-label="Scrollable schedule timeline"
        >
          <svg
            width={svgWidth}
            height={svgHeight}
            role="img"
            aria-labelledby="schedule-title schedule-description"
          >
            <title id="schedule-title">
              {schedule.product_name} production schedule
            </title>
            <desc id="schedule-description">
              Production lanes ordered by BOM depth with batches, daily cadence,
              allocation status, gaps and finished-good lineage.
            </desc>
            <defs>
              <pattern
                id="schedule-open-hatch"
                width="8"
                height="8"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="8" height="8" fill="#f8fafc" />
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="8"
                  stroke="#64748b"
                  strokeWidth="2"
                />
              </pattern>
              <pattern
                id="schedule-other-hatch"
                width="8"
                height="8"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(135)"
              >
                <rect width="8" height="8" fill="#e2e8f0" />
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="8"
                  stroke="#94a3b8"
                  strokeWidth="2"
                />
              </pattern>
              <pattern
                id="schedule-gap-hatch"
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
              >
                <path d="M0 6L6 0" stroke="#cbd5e1" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width={LABEL_WIDTH} height={svgHeight} fill="#ffffff" />
            <line
              x1={LABEL_WIDTH}
              x2={LABEL_WIDTH}
              y1={0}
              y2={svgHeight}
              stroke="#cbd5e1"
            />
            {ticks.map((day) => {
              const x = LABEL_WIDTH + (day - startDay) * (plotWidth / dayCount);
              return (
                <g key={day}>
                  <line
                    x1={x}
                    x2={x}
                    y1={AXIS_HEIGHT - 8}
                    y2={svgHeight}
                    stroke="#e2e8f0"
                  />
                  <text x={x + 4} y={18} fill="#64748b" fontSize={11}>
                    {formatDay(day)}
                  </text>
                </g>
              );
            })}
            {model.lanes.map((lane, laneIndex) => {
              const y = AXIS_HEIGHT + laneIndex * LANE_HEIGHT;
              const laneStepId = stepIdByMaterial.get(lane.material);
              return (
                <g key={lane.material}>
                  <rect
                    x={0}
                    y={y}
                    width={svgWidth}
                    height={LANE_HEIGHT}
                    fill={
                      lane.role === "finished_good"
                        ? "#eff6ff"
                        : laneIndex % 2 === 0
                          ? "#ffffff"
                          : "#f8fafc"
                    }
                  />
                  <line x1={0} x2={svgWidth} y1={y} y2={y} stroke="#e2e8f0" />
                  <text
                    x={12}
                    y={y + 26}
                    fill="#0f172a"
                    fontWeight={lane.role === "finished_good" ? 700 : 600}
                    fontSize={13}
                  >
                    {lane.name}
                  </text>
                  <text x={12} y={y + 45} fill="#64748b" fontSize={11}>
                    {lane.material} · depth {lane.bom_depth} ·{" "}
                    {lane.role.replace("_", " ")}
                  </text>
                  {model.gaps
                    .filter((gap) => gap.laneMaterial === lane.material)
                    .map((gap) => (
                      <g key={`${gap.start}-${gap.end}`}>
                        <rect
                          x={xForDate(gap.start)}
                          y={y + 14}
                          width={widthForDays(gap.days)}
                          height={56}
                          fill="url(#schedule-gap-hatch)"
                          stroke="#cbd5e1"
                          strokeDasharray="3 3"
                        />
                        {widthForDays(gap.days) > 35 && (
                          <text
                            x={xForDate(gap.start) + 4}
                            y={y + 28}
                            fill="#64748b"
                            fontSize={10}
                          >
                            {gap.days}d gap
                          </text>
                        )}
                      </g>
                    ))}
                  {granularity === "campaign" &&
                    lane.campaigns.length === 0 && (
                      <text
                        x={LABEL_WIDTH + 12}
                        y={y + 45}
                        fill="#64748b"
                        fontSize={11}
                      >
                        Daily cadence unavailable; batch windows remain
                        available in Batches view.
                      </text>
                    )}
                  {granularity === "campaign"
                    ? lane.campaigns.map((campaignRow) => {
                        const campaignLabel =
                          campaignKey(campaignRow) ??
                          `${campaignRow.sheet}-${campaignRow.building ?? "unknown"}`;
                        const key = `${campaignLabel}-${campaignRow.sheet}-${campaignRow.building ?? "unknown"}`;
                        const batchCountByDate = new Map(
                          campaignRow.daily_batch_counts.map((point) => [
                            point.date,
                            point.value,
                          ]),
                        );
                        const fillWeightByDate = new Map(
                          campaignRow.daily_fill_weights.map((point) => [
                            point.date,
                            point.value,
                          ]),
                        );
                        const points = [
                          ...new Set([
                            ...batchCountByDate.keys(),
                            ...fillWeightByDate.keys(),
                          ]),
                        ]
                          .filter(
                            (date) =>
                              date >= model.start! && date <= model.end!,
                          )
                          .sort()
                          .map((date) => ({
                            date,
                            batchCount: batchCountByDate.get(date),
                            fillWeight: fillWeightByDate.get(date),
                          }));
                        const campaignBatches = lane.batches.filter(
                          (batch) =>
                            campaignKey(campaignRow) != null &&
                            campaignKey(batch) === campaignKey(campaignRow),
                        );
                        const dates = [
                          ...points.map((point) => point.date),
                          ...campaignBatches.flatMap((batch) => [
                            batch.start < model.start!
                              ? model.start!
                              : batch.start,
                            batch.end > model.end! ? model.end! : batch.end,
                          ]),
                        ];
                        if (dates.length === 0) {
                          return null;
                        }
                        const bandStart = dates.reduce((min, value) =>
                          value < min ? value : min,
                        );
                        const bandEnd = dates.reduce((max, value) =>
                          value > max ? value : max,
                        );
                        const bandWidth = widthForDays(
                          parseDay(bandEnd) - parseDay(bandStart) + 1,
                        );
                        return (
                          <g key={key}>
                            <title>
                              {`${campaignLabel}\n${bandStart} – ${bandEnd}\n${campaignBatches.length} production batches\nSource: ${schedule.source.cadence}`}
                            </title>
                            <rect
                              x={xForDate(bandStart)}
                              y={y + 14}
                              width={bandWidth}
                              height={56}
                              rx={3}
                              fill="#dbeafe"
                              fillOpacity={0.35}
                              stroke="#2563eb"
                              strokeWidth={1.5}
                            />
                            {bandWidth > 70 && (
                              <text
                                x={xForDate(bandStart) + 5}
                                y={y + 28}
                                fill="#1e3a8a"
                                fontSize={10}
                              >
                                {campaignLabel}
                              </text>
                            )}
                            {points.length === 0 && (
                              <text
                                x={xForDate(bandStart) + 5}
                                y={y + 49}
                                fill="#64748b"
                                fontSize={10}
                              >
                                Daily cadence not recorded
                              </text>
                            )}
                            {points.map((point) => {
                              const intensity =
                                point.batchCount != null && model.maxCadence > 0
                                  ? point.batchCount / model.maxCadence
                                  : point.fillWeight != null &&
                                      model.maxFillWeight > 0
                                    ? point.fillWeight / model.maxFillWeight
                                    : 0;
                              const opacity = 0.2 + intensity * 0.8;
                              return (
                                <g key={`${key}-${point.date}`}>
                                  <title>
                                    {`${campaignLabel}\n${point.date}: ${point.batchCount == null ? "batch count not recorded" : `${formatQuantity(point.batchCount)} batches`}\nFill weight: ${point.fillWeight == null ? "not recorded" : formatQuantity(point.fillWeight)} ${lane.uom ?? ""}\nSource: ${schedule.source.cadence}`}
                                  </title>
                                  <rect
                                    x={xForDate(point.date)}
                                    y={y + 32}
                                    width={Math.max(3, plotWidth / dayCount)}
                                    height={36}
                                    fill="#2563eb"
                                    fillOpacity={opacity}
                                    stroke="#1d4ed8"
                                  />
                                </g>
                              );
                            })}
                          </g>
                        );
                      })
                    : lane.batches.map((batch) => {
                        const visibleStart =
                          batch.start < model.start!
                            ? model.start!
                            : batch.start;
                        const visibleEnd =
                          batch.end > model.end! ? model.end! : batch.end;
                        const x = xForDate(visibleStart);
                        const width = widthForDays(
                          parseDay(visibleEnd) - parseDay(visibleStart) + 1,
                        );
                        const stepId = laneStepId;
                        const selectableFinishedGood =
                          lane.role === "finished_good" && Boolean(batch.batch);
                        const interactive =
                          Boolean(stepId) || selectableFinishedGood;
                        const activate = () => {
                          trackScheduleInteraction(
                            selectableFinishedGood
                              ? "production_schedule_lineage_selected"
                              : "production_schedule_batch_drilled",
                          );
                          if (selectableFinishedGood) {
                            setSelectedFgBatch((current) =>
                              current === batch.batch ? null : batch.batch,
                            );
                          }
                          if (stepId) {
                            onStepSelect(stepId);
                          }
                        };
                        const lineage = model.lineage.get(batch.id);
                        const fill =
                          batch.allocation_status === "open"
                            ? "url(#schedule-open-hatch)"
                            : batch.allocation_status === "other"
                              ? "url(#schedule-other-hatch)"
                              : allocationColor[batch.allocation_status];
                        let stripX = x;
                        const allocationTotal = Object.values(
                          batch.allocation_totals,
                        ).reduce((sum, value) => sum + value, 0);
                        // Raw evidence can exceed the confirmed receipt
                        // quantity. Keep that discrepancy visible in the
                        // tooltip without letting the strip overflow its bar.
                        const quantity = Math.max(
                          batch.quantity ?? allocationTotal,
                          allocationTotal,
                        );
                        return (
                          <g
                            key={batch.id}
                            aria-label={`Batch ${batch.batch ?? batch.order}, ${batch.allocation_status}${lineage ? `, ${lineage} lineage match` : ""}${selectableFinishedGood ? ", select lineage" : ""}${stepId ? ", open production step" : ""}`}
                            aria-pressed={
                              selectableFinishedGood
                                ? selectedFgBatch === batch.batch
                                : undefined
                            }
                            {...(interactive
                              ? {
                                  role: "button",
                                  tabIndex: 0,
                                  className: clickTarget,
                                  onClick: activate,
                                  onKeyDown: (
                                    event: KeyboardEvent<SVGGElement>,
                                  ) => {
                                    if (
                                      event.key === "Enter" ||
                                      event.key === " "
                                    ) {
                                      event.preventDefault();
                                      activate();
                                    }
                                  },
                                }
                              : { role: "img" })}
                          >
                            <title>{batchTooltip(batch)}</title>
                            <rect
                              x={x}
                              y={y + 18}
                              width={width}
                              height={46}
                              rx={3}
                              fill={fill}
                              stroke={
                                lineage
                                  ? "#0f172a"
                                  : allocationColor[batch.allocation_status]
                              }
                              strokeWidth={lineage ? 3 : 1}
                              strokeDasharray={
                                lineage === "candidate" ||
                                batch.allocation_status === "unresolved"
                                  ? "5 3"
                                  : undefined
                              }
                            />
                            {batch.allocation_status === "shared" && (
                              <text
                                x={x + 4}
                                y={y + 33}
                                fill="#ffffff"
                                fontSize={15}
                                fontWeight={700}
                              >
                                +
                              </text>
                            )}
                            {width > 42 && (
                              <text
                                x={x + 6}
                                y={y + 51}
                                fill={
                                  batch.allocation_status === "open" ||
                                  batch.allocation_status === "other"
                                    ? "#334155"
                                    : "#ffffff"
                                }
                                fontSize={10}
                              >
                                {batch.batch ?? batch.order}
                              </text>
                            )}
                            {quantity > 0 &&
                              (
                                Object.entries(
                                  batch.allocation_totals,
                                ) as Array<[ProductionScheduleStatus, number]>
                              ).map(([allocationStatus, value]) => {
                                const segmentWidth = width * (value / quantity);
                                const currentX = stripX;
                                stripX += segmentWidth;
                                return value > 0 ? (
                                  <rect
                                    key={allocationStatus}
                                    x={currentX}
                                    y={y + 59}
                                    width={segmentWidth}
                                    height={5}
                                    fill={allocationColor[allocationStatus]}
                                  />
                                ) : null;
                              })}
                          </g>
                        );
                      })}
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </section>
  );
};
