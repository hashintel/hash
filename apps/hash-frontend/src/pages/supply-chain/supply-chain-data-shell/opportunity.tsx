import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { DocsIconButton } from "../shared/action-buttons";
import {
  useCostParams,
  useOutlierSetting,
  formatCost,
  formatNumber,
} from "../shared/cost";
import { fetchStepDetail, fetchSiteSummary } from "../shared/data";
import { detailDateKeyFromColumns } from "../shared/detail-date-key";
import { useDocs } from "../shared/docs/use-docs";
import { buildCsvContent, downloadCsv } from "../shared/export-utils";
import { useSupplierPerformanceEnabled } from "../shared/feature-flags";
import { ErrorState, SupplyChainAppSkeleton } from "../shared/load-state";
import { ensureNodeStats } from "../shared/normalize-contract";
import { applyOutlierSelectionToStep } from "../shared/outlier-selection";
import {
  computePeriodDeltas,
  computeCostComparison,
} from "../shared/period-trends";
import { useProcurementBasis } from "../shared/procurement-basis-context";
import {
  filterGraphNodeByDateRange,
  filterStepByDateRange,
  applyProcurementBasisToStep,
} from "../shared/range-filter";
import { deduplicateNodes } from "../shared/site-aggregation";
import { trackSupplyChainInteraction } from "../shared/telemetry";
import {
  cutoffForRange,
  timeRangeLongLabel,
  type TimeRange,
} from "../shared/time-range";
import { useTimeRange } from "../shared/time-range-context";
import { TrendIndicator } from "../shared/trend-indicator";
import { useSearchParams } from "../shared/use-search-params";
import {
  BriefBoxPlot,
  BriefHistogram,
  BriefSparkline,
} from "./opportunity/brief-charts";
import {
  buildDwellOpportunityBrief,
  buildPlanningOpportunityBrief,
  firstProductForNode,
  type DwellOpportunityBrief,
  type OpportunityBriefSourceKind,
  type PlanningOpportunityBrief,
  type OpportunityType,
  type ProductNodeRef,
  type SupplierBriefSummary,
  type ProductionInsight,
  type BriefEvidenceRow,
  type FirstUseDwellSummary,
} from "./opportunity/opportunity-utils";

import type {
  Product,
  SiteNode,
  StepDetail,
  DetailRows,
  SiteSummaryRollups,
  SiteData,
  SiteSummary,
} from "../shared/types";
import type { RecommendedAction } from "./opportunity/recommendation-playbook";

const SM = "@media (min-width: 640px)";
const PRINT = "@media print";

const article = css({
  mx: "auto",
  maxW: "[1024px]",
  px: "6",
  py: "8",
  color: "fg.heading",
  [PRINT]: {
    mx: "0",
    maxW: "[none]",
    px: "0",
    py: "0",
    w: "full",
  },
});
const topBar = css({
  mb: "6",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "4",
});
const topActions = css({ display: "flex", alignItems: "center", gap: "2" });
const briefScrollArea = css({
  h: "full",
  minH: "0",
  overflowY: "auto",
  "@media print": {
    h: "auto",
    overflow: "visible",
  },
});
const headerEl = css({
  borderBottomWidth: "1px",
  borderColor: "fg.heading",
  pb: "5",
});
const eyebrow = css({
  mb: "3",
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "2",
  textStyle: "xs",
  fontWeight: "medium",
  textTransform: "uppercase",
  letterSpacing: "[0.12em]",
  color: "fg.muted",
});
const eyebrowDot = css({
  h: "1",
  w: "1",
  borderRadius: "full",
  bg: "fg.subtle",
});
const h1 = css({
  fontFamily: "display",
  textStyle: "3xl",
  fontWeight: "medium",
  lineHeight: "[1.25]",
});
const metaGrid = css({
  mt: "3",
  display: "grid",
  gap: "2",
  textStyle: "sm",
  color: "fg.muted",
  alignItems: "start",
  [SM]: { gridTemplateColumns: "[repeat(2,minmax(0,1fr))]" },
});
const metaStack = css({ display: "flex", flexDirection: "column", gap: "2" });
const metricsSection = css({
  display: "grid",
  gap: "4",
  py: "5",
  [SM]: { gridTemplateColumns: "[repeat(3,minmax(0,1fr))]" },
  [PRINT]: { gridTemplateColumns: "[repeat(2,minmax(0,1fr))]" },
});
const triggerCard = css({
  mb: "4",
  borderRadius: "lg",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  bg: "[#fafafa]",
  p: "4",
});
const triggerTop = css({
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "4",
  flexWrap: "wrap",
});
const triggerEyebrow = css({
  textStyle: "xs",
  fontWeight: "semibold",
  textTransform: "uppercase",
  letterSpacing: "[0.08em]",
  color: "fg.muted",
});
const triggerMetric = css({
  textStyle: "xl",
  fontWeight: "semibold",
  fontVariantNumeric: "tabular-nums",
  color: "fg.heading",
});
const triggerReason = css({
  mt: "2",
  textStyle: "sm",
  lineHeight: "[1.625]",
  color: "fg.heading",
});
const triggerChip = css({
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "full",
  bg: "bgSolid.min",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  px: "2.5",
  py: "1",
  textStyle: "xs",
  color: "fg.muted",
  whiteSpace: "nowrap",
});
const grid3Mt = css({
  mt: "4",
  display: "grid",
  gap: "3",
  [SM]: { gridTemplateColumns: "[repeat(3,minmax(0,1fr))]" },
  [PRINT]: { gridTemplateColumns: "[repeat(2,minmax(0,1fr))]" },
});
const distGrid = css({
  mt: "5",
  mb: "6",
  display: "grid",
  gap: "3",
  [SM]: { gridTemplateColumns: "[repeat(2,minmax(0,1fr))]" },
});
const evidenceHeading = css({
  mb: "2",
  textStyle: "xs",
  fontWeight: "semibold",
  textTransform: "uppercase",
  letterSpacing: "[0.08em]",
  color: "fg.muted",
});
const impactWrap = css({
  overflowX: "auto",
  borderRadius: "lg",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
});
const briefTable = css({ w: "full", textStyle: "sm", lineHeight: "normal" });
const impactThead = css({
  bg: "[#fafafa]",
  textAlign: "left",
  textStyle: "xs",
  fontWeight: "medium",
  textTransform: "uppercase",
  letterSpacing: "[0.08em]",
  color: "fg.muted",
  borderBottomWidth: "1px",
  borderColor: "[#d9d9d9]",
});
const cellTh = css({ px: "3", py: "2" });
const cellThRight = css({ px: "3", py: "2", textAlign: "right" });
const tbodyDivide = css({
  "& > tr": { borderTopWidth: "1px", borderColor: "[#f0f0f0]" },
  "& > tr:first-child": { borderTopWidth: "0" },
});
const cellTd = css({ px: "3", py: "2" });
const cellTdRight = css({
  px: "3",
  py: "2",
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
});
const cellTdSaving = css({
  px: "3",
  py: "2",
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
  fontWeight: "medium",
  color: "status.success.fg.body",
});
const scenarioLabel = css({ fontWeight: "medium", color: "fg.heading" });
const scenarioRationale = css({ textStyle: "xs", color: "fg.muted" });
const grid4 = css({
  display: "grid",
  gap: "3",
  [SM]: { gridTemplateColumns: "[repeat(4,minmax(0,1fr))]" },
});
const optionCard = css({
  borderRadius: "lg",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  p: "3",
});
const optionLabel = css({
  textStyle: "xs",
  fontWeight: "medium",
  color: "fg.muted",
});
const optionDays = css({
  mt: "1",
  textStyle: "xl",
  fontWeight: "semibold",
  fontVariantNumeric: "tabular-nums",
});
const optionDesc = css({
  mt: "2",
  textStyle: "xs",
  lineHeight: "[1.625]",
  color: "fg.muted",
});
const grid2Mt = css({
  mt: "4",
  display: "grid",
  gap: "3",
  [SM]: { gridTemplateColumns: "[repeat(2,minmax(0,1fr))]" },
});
const planningImpactStack = css({
  mt: "4",
  display: "flex",
  flexDirection: "column",
  gap: "2",
});
const nextStepsEmpty = css({ textStyle: "sm", color: "fg.muted" });
const sectionEl = css({
  borderTopWidth: "1px",
  borderColor: "bd.subtle",
  py: "5",
});
const sectionTitle = css({
  mb: "3",
  textStyle: "base",
  fontWeight: "semibold",
  color: "fg.heading",
});
const metricCard = css({
  borderRadius: "lg",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  bg: "bgSolid.min",
  p: "3",
});
const metricLabel = css({
  textStyle: "xs",
  fontWeight: "medium",
  color: "fg.muted",
});
const metricValue = css({
  mt: "1",
  textStyle: "xl",
  fontWeight: "semibold",
  fontVariantNumeric: "tabular-nums",
  color: "fg.heading",
});
const metricBad = css({ color: "status.error.fg.body" });
const metricGood = css({ color: "status.success.fg.body" });
const metricWarning = css({ color: "status.warning.fg.body" });
const metricTrendWrap = css({
  mt: "1.5",
  textStyle: "xs",
  flexWrap: "wrap",
});
const metricTrendNote = css({ color: "fg.subtle" });
const checklistCard = css({
  borderRadius: "lg",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  p: "3",
});
const calloutCard = css({ borderRadius: "lg", bg: "[#fafafa]", p: "3" });
// Confidence Assessment: bordered like the executive-summary callout, with top
// margin to separate it from the opportunity-diagnosis bullets above.
const confidenceCallout = css({
  mt: "4",
  borderRadius: "lg",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  bg: "[#fafafa]",
  p: "3",
});
const calloutTitle = css({
  textStyle: "sm",
  fontWeight: "semibold",
  color: "fg.heading",
});
const calloutBody = css({
  mt: "1",
  textStyle: "sm",
  lineHeight: "[1.625]",
  color: "fg.muted",
});
const bulletList = css({
  listStyleType: "disc",
  pl: "5",
  textStyle: "sm",
  lineHeight: "[1.625]",
  color: "fg.muted",
  "& > li + li": { mt: "1" },
});
const checklistBulletMt = css({ mt: "2" });
const statTableWrap = css({
  overflow: "hidden",
  borderRadius: "lg",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
});
const statTdLabel = css({
  px: "3",
  py: "2",
  color: "fg.muted",
  verticalAlign: "top",
  w: "[42%]",
});
const statTdValue = css({
  px: "3",
  py: "2",
  textAlign: "right",
  fontWeight: "medium",
  fontVariantNumeric: "tabular-nums",
  color: "fg.heading",
  overflowWrap: "anywhere",
  verticalAlign: "top",
});
const stackedValue = css({
  display: "inline-flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: "0.5",
  whiteSpace: "nowrap",
});
const metaTerm = css({ fontWeight: "medium", color: "fg.heading" });
const errorPad = css({ px: "6", py: "8" });
const labelWithBadge = css({
  display: "inline-flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "1.5",
});
const offRecipeBadge = css({
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "full",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "status.warning.bd.subtle",
  bg: "status.warning.bg.subtle",
  color: "status.warning.fg.body",
  px: "2",
  py: "0.5",
  textStyle: "xxs",
  fontWeight: "medium",
  whiteSpace: "nowrap",
});
const leverageCallout = css({
  mb: "4",
  borderRadius: "lg",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  p: "3",
  display: "grid",
  gap: "1",
});
const leverageTitle = css({
  textStyle: "xs",
  fontWeight: "semibold",
  textTransform: "uppercase",
  letterSpacing: "[0.08em]",
  color: "fg.muted",
});
const leverageBody = css({
  textStyle: "sm",
  lineHeight: "[1.625]",
  color: "fg.heading",
});
const firstUseNote = css({
  mt: "3",
  textStyle: "sm",
  lineHeight: "[1.625]",
  color: "fg.heading",
});
const provenanceText = css({
  mt: "2",
  textStyle: "xs",
  lineHeight: "[1.5]",
  color: "fg.subtle",
});
const subTableNote = css({ mt: "2", textStyle: "xs", color: "fg.muted" });
const topEvidenceWrap = css({
  pt: "2",
  display: "flex",
  flexDirection: "column",
  gap: "2",
});
const chartsGrid = css({
  mb: "4",
  display: "grid",
  gap: "4",
  [SM]: { gridTemplateColumns: "[repeat(3,minmax(0,1fr))]" },
  [PRINT]: { gridTemplateColumns: "[repeat(2,minmax(0,1fr))]" },
});
const metricCue = css({ fontSize: "[0.75em]" });
const srOnly = css({
  position: "absolute",
  w: "[1px]",
  h: "[1px]",
  p: "0",
  m: "[-1px]",
  overflow: "hidden",
  clip: "[rect(0,0,0,0)]",
  whiteSpace: "nowrap",
  borderWidth: "0",
});
const heroBanner = css({
  mt: "4",
  mb: "4",
  borderRadius: "lg",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  bg: "[#fafafa]",
  p: "4",
  display: "grid",
  gap: "2",
});
const heroTop = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "3",
});
const heroPrize = css({
  textStyle: "2xl",
  fontWeight: "semibold",
  fontVariantNumeric: "tabular-nums",
  color: "fg.heading",
});
const heroPrizeLabel = css({
  textStyle: "xs",
  fontWeight: "medium",
  textTransform: "uppercase",
  letterSpacing: "[0.08em]",
  color: "fg.muted",
});
const heroAction = css({
  textStyle: "sm",
  lineHeight: "[1.625]",
  color: "fg.heading",
});
const heroRank = css({
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "full",
  bg: "bgSolid.min",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  px: "2.5",
  py: "1",
  textStyle: "xs",
  color: "fg.muted",
  whiteSpace: "nowrap",
});

interface OpportunityBriefProps {
  products: Product[];
  siteId: string;
  productId: string;
  stepId: string;
  opportunityType: OpportunityType;
}

function formatDeviation(value: number | null): string {
  if (value == null) {
    return "-";
  }
  return `${value > 0 ? "+" : ""}${formatNumber(value, { maximumFractionDigits: 0 })}%`;
}

function formatDaysAndDeviation(
  days: number | null,
  deviation: number | null,
): string {
  return `${formatNumber(days, { maximumFractionDigits: 1 })}d / ${formatDeviation(deviation)}`;
}

function formatExceedingPlan(brief: PlanningOpportunityBrief): string {
  if (brief.pctExceedingPlan == null) {
    return "-";
  }
  const count =
    brief.nExceedingPlan == null ? "–" : formatNumber(brief.nExceedingPlan);
  return `${count} / ${formatNumber(brief.pctExceedingPlan, { maximumFractionDigits: 0 })}%`;
}

function toneForDeviation(value: number | null): "bad" | "good" | "neutral" {
  if (value == null) {
    return "neutral";
  }
  if (value > 0) {
    return "bad";
  }
  if (value < 0) {
    return "good";
  }
  return "neutral";
}

function formatTrendSummary(
  trend: {
    pctChange: number | null;
    currentValue: number | null;
    previousValue: number | null;
    currentN: number;
    previousN: number;
  },
  range: TimeRange,
): string {
  if (
    trend.pctChange == null ||
    trend.currentValue == null ||
    trend.previousValue == null
  ) {
    return `No comparison (${formatNumber(trend.currentN)} current / ${formatNumber(trend.previousN)} previous samples)`;
  }
  return `${formatNumber(trend.currentValue, { maximumFractionDigits: 1 })}d vs ${formatNumber(trend.previousValue, { maximumFractionDigits: 1 })}d previous ${range} (${formatDeviation(trend.pctChange)})`;
}

const HighestCostMonthValue = ({ brief }: { brief: DwellOpportunityBrief }) => {
  if (!brief.highestCostMonth) {
    return "-";
  }
  return (
    <span className={stackedValue}>
      <span>{brief.highestCostMonth.month}</span>
      <span>
        {formatCost(brief.highestCostMonth.cost, brief.currency, {
          compact: true,
        })}
      </span>
    </span>
  );
};

const BriefSection = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => {
  return (
    <section className={cx("break-inside-avoid", sectionEl)}>
      <h2 className={sectionTitle}>{title}</h2>
      {children}
    </section>
  );
};

interface TrendChip {
  pctChange: number | null;
  /** Last-period value, formatted for display. */
  previous: string;
}

/** Build a headline trend chip, or null when there's no comparable prior period. */

const MetricCard = ({
  label,
  value,
  tone = "neutral",
  trend,
}: {
  label: string;
  value: string;
  tone?: "bad" | "good" | "neutral" | "warning";
  trend?: TrendChip | null;
}) => {
  const cue = tone === "bad" ? "▲" : tone === "good" ? "▼" : null;
  const cueLabel =
    tone === "bad"
      ? "unfavourable"
      : tone === "good"
        ? "favourable"
        : tone === "warning"
          ? "watch"
          : null;
  return (
    <div className={metricCard}>
      <div className={metricLabel}>{label}</div>
      <div
        className={cx(
          metricValue,
          tone === "bad"
            ? metricBad
            : tone === "good"
              ? metricGood
              : tone === "warning"
                ? metricWarning
                : undefined,
        )}
      >
        {cue && (
          <span aria-hidden className={metricCue}>
            {cue}{" "}
          </span>
        )}
        {value}
        {cueLabel && <span className={srOnly}> ({cueLabel})</span>}
      </div>
      {trend && (
        <TrendIndicator pctChange={trend.pctChange} className={metricTrendWrap}>
          <span>{trend.previous}</span>
          <span className={metricTrendNote}>last period</span>
        </TrendIndicator>
      )}
    </div>
  );
};

const BulletList = ({
  items,
  className,
}: {
  items: string[];
  className?: string;
}) => {
  return (
    <ul className={cx(bulletList, className)}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
};

const Checklist = ({ items }: { items: string[] }) => {
  return (
    <div className={checklistCard}>
      <BulletList items={items} className={checklistBulletMt} />
    </div>
  );
};

const Callout = ({ title, body }: { title: string; body: string }) => {
  return (
    <div className={calloutCard}>
      <h3 className={calloutTitle}>{title}</h3>
      <p className={calloutBody}>{body}</p>
    </div>
  );
};

const StatTable = ({ rows }: { rows: Array<[string, React.ReactNode]> }) => {
  return (
    <div className={statTableWrap}>
      <table className={briefTable}>
        <tbody className={tbodyDivide}>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td className={statTdLabel}>{label}</td>
              <td className={statTdValue}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const MetaLine = ({ label, value }: { label: string; value: string }) => {
  return (
    <div>
      <span className={metaTerm}>{label}: </span>
      {value || "-"}
    </div>
  );
};

function rankingText(ranking: BriefRanking): string {
  const noun = ranking.kind === "dwell" ? "dwell cost" : "planning mismatch";
  const plural = ranking.total === 1 ? noun : `${noun}s`;
  return `#${ranking.rank} of the plant's top ${ranking.total} ${plural}`;
}

const HeroBannerShell = ({
  prizeLabel,
  prize,
  action,
  ranking,
}: {
  prizeLabel: string;
  prize: string;
  action: string;
  ranking: BriefRanking | null;
}) => {
  return (
    <div className={heroBanner}>
      <div className={heroTop}>
        <div>
          <div className={heroPrizeLabel}>{prizeLabel}</div>
          <div className={heroPrize}>{prize}</div>
        </div>
        {ranking && <span className={heroRank}>{rankingText(ranking)}</span>}
      </div>
      <p className={heroAction}>{action}</p>
    </div>
  );
};

const ConfidenceBadge = ({ label }: { label: "High" | "Warning" | "Low" }) => {
  const className = cx(
    triggerChip,
    label === "High"
      ? css({
          bg: "status.success.bg.subtle",
          borderColor: "status.success.bd.subtle",
          color: "status.success.fg.body",
          fontWeight: "semibold",
        })
      : label === "Warning"
        ? css({
            bg: "status.warning.bg.subtle",
            borderColor: "status.warning.bd.subtle",
            color: "status.warning.fg.body",
            fontWeight: "semibold",
          })
        : css({
            bg: "status.error.bg.subtle",
            borderColor: "status.error.bd.subtle",
            color: "status.error.fg.body",
            fontWeight: "semibold",
          }),
  );
  return <span className={className}>Confidence: {label}</span>;
};

const DwellExecutiveSummary = ({
  brief,
  timeRange,
}: {
  brief: DwellOpportunityBrief;
  timeRange: TimeRange;
}) => {
  const moderate =
    brief.scenarios.find((scenario) => scenario.label === "Moderate") ??
    brief.scenarios[0];
  return (
    <div className={grid3Mt}>
      <MetricCard
        label={`Current carry cost (${timeRange})`}
        value={formatCost(brief.periodCost, brief.currency, { compact: true })}
      />

      <MetricCard
        label="Annualized current cost"
        value={formatCost(brief.annualizedCost, brief.currency, {
          compact: true,
        })}
      />

      <MetricCard
        label="Moderate annualized saving"
        value={formatCost(moderate?.annualizedSaving, brief.currency, {
          compact: true,
        })}
        tone="good"
      />
    </div>
  );
};

const PlanningExecutiveSummary = ({
  brief,
}: {
  brief: PlanningOpportunityBrief;
}) => {
  return (
    <div className={grid4}>
      <MetricCard
        label="Current plan"
        value={`${formatNumber(brief.currentPlanDays, { maximumFractionDigits: 1 })}d`}
      />

      <MetricCard
        label="P95"
        value={formatDaysAndDeviation(brief.p95Days, brief.p95DeviationPct)}
        tone={toneForDeviation(brief.p95DeviationPct)}
      />

      <MetricCard
        label="Median"
        value={formatDaysAndDeviation(
          brief.medianDays,
          brief.medianDeviationPct,
        )}
        tone={toneForDeviation(brief.medianDeviationPct)}
      />

      <MetricCard
        label="Mean"
        value={formatDaysAndDeviation(brief.meanDays, brief.meanDeviationPct)}
        tone={toneForDeviation(brief.meanDeviationPct)}
      />

      <MetricCard
        label="Batches exceeding plan"
        value={formatExceedingPlan(brief)}
        tone={(brief.pctExceedingPlan ?? 0) > 20 ? "bad" : "neutral"}
      />
    </div>
  );
};

const DwellImpactSection = ({
  brief,
  currency,
}: {
  brief: DwellOpportunityBrief;
  currency: string | null;
}) => {
  return (
    <BriefSection title="Modeled Impact Scenarios">
      <div className={impactWrap}>
        <table className={briefTable}>
          <thead className={impactThead}>
            <tr>
              <th className={cellTh}>Scenario</th>
              <th className={cellThRight}>Target dwell</th>
              <th className={cellThRight}>Reduction</th>
              <th className={cellThRight}>Period saving</th>
              <th className={cellThRight}>Annualized saving</th>
            </tr>
          </thead>
          <tbody className={tbodyDivide}>
            {brief.scenarios.map((scenario) => (
              <tr key={scenario.label}>
                <td className={cellTd}>
                  <div className={scenarioLabel}>{scenario.label}</div>
                  <div className={scenarioRationale}>
                    {scenario.approximate ? "Approximate: " : ""}
                    {scenario.rationale}
                  </div>
                </td>
                <td className={cellTdRight}>
                  {formatNumber(scenario.targetDays, {
                    maximumFractionDigits: 1,
                  })}
                  d
                </td>
                <td className={cellTdRight}>
                  {formatNumber(scenario.reductionPct * 100, {
                    maximumFractionDigits: 0,
                  })}
                  %
                </td>
                <td className={cellTdRight}>
                  {formatCost(scenario.periodSaving, currency, {
                    compact: true,
                  })}
                </td>
                <td className={cellTdSaving}>
                  {formatCost(scenario.annualizedSaving, currency, {
                    compact: true,
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </BriefSection>
  );
};

const PlanningImpactTable = ({
  brief,
}: {
  brief: PlanningOpportunityBrief;
}) => {
  if (brief.calibrationImpact.length === 0) {
    return null;
  }
  return (
    <div className={planningImpactStack}>
      <div className={impactWrap}>
        <table className={briefTable}>
          <thead className={impactThead}>
            <tr>
              <th className={cellTh}>Target</th>
              <th className={cellThRight}>Days</th>
              <th className={cellThRight}>Buffer vs plan</th>
              <th className={cellThRight}>Late-event risk</th>
            </tr>
          </thead>
          <tbody className={tbodyDivide}>
            {brief.calibrationImpact.map((row) => (
              <tr key={row.label}>
                <td className={cellTd}>
                  <div className={scenarioLabel}>{row.label}</div>
                  <div className={scenarioRationale}>{row.description}</div>
                </td>
                <td className={cellTdRight}>
                  {formatNumber(row.days, { maximumFractionDigits: 1 })}d
                </td>
                <td className={cellTdRight}>
                  {row.bufferDaysVsPlan == null
                    ? "-"
                    : `${row.bufferDaysVsPlan > 0 ? "+" : ""}${formatNumber(row.bufferDaysVsPlan, { maximumFractionDigits: 1 })}d`}
                </td>
                <td className={cellTdRight}>
                  {row.pctExceeding == null
                    ? "-"
                    : `${formatNumber(row.pctExceeding, { maximumFractionDigits: 0 })}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={subTableNote}>
        Buffer vs plan is the planning days released (positive) or added
        (negative) by adopting each target. Late-event risk is the share of
        filtered observations that would still exceed the target, using the
        current outlier setting.
      </p>
    </div>
  );
};

const PlanningRecommendationSection = ({
  brief,
}: {
  brief: PlanningOpportunityBrief;
}) => {
  return (
    <BriefSection title="Planning Reference Options">
      <div className={grid4}>
        {brief.serviceLevelOptions.map((option) => (
          <div key={option.label} className={optionCard}>
            <div className={optionLabel}>{option.label}</div>
            <div className={optionDays}>
              {formatNumber(option.days, { maximumFractionDigits: 1 })}d
            </div>
            <p className={optionDesc}>{option.description}</p>
          </div>
        ))}
      </div>
      <PlanningImpactTable brief={brief} />
      <div className={grid2Mt}>
        <Callout
          title="Operational Excellence"
          body="Use the median and P75 as performance references. If the process can reliably shift toward these levels, planning can revisit buffer with better evidence."
        />

        <Callout
          title={
            brief.calibrationDirection === "tighten"
              ? "Review Planning Buffer"
              : "Review Service Protection"
          }
          body={
            brief.calibrationDirection === "tighten"
              ? "P95 is below the current plan, so the assumption may include extra buffer. Test any tighter value against the service level the business needs to protect."
              : "Use P95 as an initial planning reference, then adjust based on the service level the business wants the parameter to protect."
          }
        />
      </div>
    </BriefSection>
  );
};

const E2ELeverageSection = ({ brief }: { brief: DwellOpportunityBrief }) => {
  const lev = brief.e2eLeverage;
  if (!lev) {
    return null;
  }
  const share = formatNumber(lev.bindingSharePct, { maximumFractionDigits: 0 });
  const marginal = formatNumber(lev.expectedMarginalPerDay, {
    maximumFractionDigits: 2,
  });
  const lowLeverage = lev.expectedMarginalPerDay < 0.2;
  const next =
    lev.nextBottleneckLabel && lev.nextBottleneckDays != null
      ? ` After about ${formatNumber(lev.nextBottleneckDays, { maximumFractionDigits: 1 })}d of reduction, ${lev.nextBottleneckLabel} becomes the binding constraint.`
      : "";
  return (
    <BriefSection title="End-to-end leverage">
      <div className={leverageCallout}>
        <div className={leverageTitle}>
          Does reducing this step move the end-to-end lead time?
        </div>
        <p className={leverageBody}>
          This step is on the binding (critical) chain in {share}% of batches,
          and each day removed yields about {marginal} end-to-end days.{next}
          {lowLeverage
            ? " Marginal end-to-end leverage is low, so treat the headline saving as a local carrying-cost reduction rather than a lead-time win."
            : ""}
        </p>
      </div>
    </BriefSection>
  );
};

const PerProductImpactSection = ({
  brief,
}: {
  brief: DwellOpportunityBrief;
}) => {
  const rows = brief.perProductImpact;
  if (rows.length === 0) {
    return null;
  }
  return (
    <BriefSection title="Impact by consuming product">
      <div className={impactWrap}>
        <table className={briefTable}>
          <thead className={impactThead}>
            <tr>
              <th className={cellTh}>Consuming product / material</th>
              <th className={cellThRight}>kg-days</th>
              <th className={cellThRight}>Est. cost</th>
              <th className={cellThRight}>Share</th>
              <th className={cellThRight}>Events</th>
            </tr>
          </thead>
          <tbody className={tbodyDivide}>
            {rows.map((row) => (
              <tr key={row.key}>
                <td className={cellTd}>
                  <span className={labelWithBadge}>
                    {row.label}
                    {row.inCurrentRecipe === false && (
                      <span className={offRecipeBadge}>
                        not in current recipe
                      </span>
                    )}
                  </span>
                </td>
                <td className={cellTdRight}>
                  {formatNumber(row.kgDays, {
                    compact: true,
                    maximumFractionDigits: 1,
                  })}
                </td>
                <td className={cellTdRight}>
                  {formatCost(row.periodCost, brief.currency, {
                    compact: true,
                  })}
                </td>
                <td className={cellTdRight}>
                  {formatNumber(row.sharePct, { maximumFractionDigits: 0 })}%
                </td>
                <td className={cellTdRight}>{formatNumber(row.events)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={subTableNote}>
        Impact is split by the immediate consuming material; an intermediate may
        appear instead of the finished good.
      </p>
    </BriefSection>
  );
};

const FirstUseDwellSection = ({
  firstUse,
  verb,
}: {
  firstUse: FirstUseDwellSummary;
  verb: "order" | "produce";
}) => {
  const firstUseSharePct = firstUse.firstUseSharePct;
  const showShare =
    firstUseSharePct != null &&
    firstUse.overallMedianDays != null &&
    firstUse.medianDays <= firstUse.overallMedianDays;

  return (
    <BriefSection title={`First-use dwell — how early do we ${verb}?`}>
      <div className={grid3Mt}>
        <MetricCard
          label="Median first-use wait"
          value={`${formatNumber(firstUse.medianDays, { maximumFractionDigits: 1 })}d`}
        />

        <MetricCard
          label="P95 first-use wait"
          value={`${formatNumber(firstUse.p95Days, { maximumFractionDigits: 1 })}d`}
        />

        {showShare && (
          <MetricCard
            label="Share of typical dwell"
            value={`${formatNumber(firstUseSharePct, { maximumFractionDigits: 0 })}%`}
            tone={firstUseSharePct >= 60 ? "warning" : "neutral"}
          />
        )}
      </div>
      <p className={firstUseNote}>{firstUse.note}</p>
    </BriefSection>
  );
};

const SupplierSection = ({ supplier }: { supplier: SupplierBriefSummary }) => {
  return (
    <BriefSection title="Supplier OTIF">
      <div className={impactWrap}>
        <table className={briefTable}>
          <thead className={impactThead}>
            <tr>
              <th className={cellTh}>Vendor</th>
              <th className={cellThRight}>OTIF</th>
              <th className={cellThRight}>Mean days late</th>
              <th className={cellThRight}>&ge;7d late</th>
              <th className={cellThRight}>Lines</th>
            </tr>
          </thead>
          <tbody className={tbodyDivide}>
            {supplier.vendors.map((value) => (
              <tr key={value.name}>
                <td className={cellTd}>{value.name}</td>
                <td className={cellTdRight}>
                  {value.otifPct == null
                    ? "-"
                    : `${formatNumber(value.otifPct, { maximumFractionDigits: 0 })}%`}
                </td>
                <td className={cellTdRight}>
                  {value.meanDaysLateAll == null
                    ? "-"
                    : `${formatNumber(value.meanDaysLateAll, { maximumFractionDigits: 1 })}d`}
                </td>
                <td className={cellTdRight}>
                  {value.ge7dPct == null
                    ? "-"
                    : `${formatNumber(value.ge7dPct, { maximumFractionDigits: 0 })}%`}
                </td>
                <td className={cellTdRight}>{formatNumber(value.nLines)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {supplier.worstEvents.length > 0 && (
        <>
          <p className={subTableNote}>
            Worst late deliveries in the selected period:
          </p>
          <BulletList
            items={supplier.worstEvents.map(
              (event) =>
                `${event.materialName ?? "Material"} from ${event.vendorName ?? "unknown vendor"}${event.poNumber ? ` (PO ${event.poNumber})` : ""}: ${formatNumber(event.daysLate, { maximumFractionDigits: 0 })}d late${event.date ? ` (${event.date})` : ""}`,
            )}
          />
        </>
      )}
      {supplier.dataQualityNote && (
        <p className={provenanceText}>{supplier.dataQualityNote}</p>
      )}
    </BriefSection>
  );
};

const ProductionInsightSection = ({
  insight,
}: {
  insight: ProductionInsight;
}) => {
  const items = [insight.yield, insight.consumption].filter(
    (xValue): xValue is string => Boolean(xValue),
  );
  if (items.length === 0) {
    return null;
  }
  return (
    <BriefSection title="Yield and consumption">
      <BulletList items={items} />
    </BriefSection>
  );
};

const TopEvidenceTable = ({ rows }: { rows: BriefEvidenceRow[] }) => {
  if (rows.length === 0) {
    return null;
  }
  const showKg = rows.some((row) => row.kgDays != null);
  const showDays = rows.some((row) => row.days != null);
  return (
    <div className={topEvidenceWrap}>
      <h3 className={evidenceHeading}>Largest contributors</h3>
      <div className={impactWrap}>
        <table className={briefTable}>
          <thead className={impactThead}>
            <tr>
              <th className={cellTh}>Item</th>
              <th className={cellTh}>Date</th>
              {showDays && <th className={cellThRight}>Days</th>}
              {showKg && <th className={cellThRight}>kg-days</th>}
            </tr>
          </thead>
          <tbody className={tbodyDivide}>
            {rows.map((row) => (
              <tr
                key={`${row.label}-${row.date ?? ""}-${row.days ?? ""}-${row.kgDays ?? ""}`}
              >
                <td className={cellTd}>{row.label}</td>
                <td className={cellTd}>{row.date ?? "-"}</td>
                {showDays && (
                  <td className={cellTdRight}>
                    {row.days == null
                      ? "-"
                      : `${formatNumber(row.days, { maximumFractionDigits: 1 })}d`}
                  </td>
                )}
                {showKg && (
                  <td className={cellTdRight}>
                    {row.kgDays == null
                      ? "-"
                      : formatNumber(row.kgDays, {
                          compact: true,
                          maximumFractionDigits: 1,
                        })}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
interface BriefRanking {
  rank: number;
  total: number;
  kind: "dwell" | "planning";
}

function computeBriefRanking(
  rollups: SiteSummaryRollups | null,
  stepId: string,
  isDwellBrief: boolean,
): BriefRanking | null {
  if (!rollups) {
    return null;
  }
  const list = isDwellBrief
    ? rollups.top_dwell_costs
    : rollups.top_planning_mismatches;
  const idx = list.findIndex((row) => row.node_id === stepId);
  if (idx < 0) {
    return null;
  }
  return {
    rank: idx + 1,
    total: list.length,
    kind: isDwellBrief ? "dwell" : "planning",
  };
}

const HeroBanner = ({
  brief,
  ranking,
}: {
  brief: DwellOpportunityBrief | PlanningOpportunityBrief;
  ranking: BriefRanking | null;
}) => {
  if (brief.kind === "dwell") {
    const moderate =
      brief.scenarios.find((step) => step.label === "Moderate") ??
      brief.scenarios[0];
    const prize = moderate?.annualizedSaving ?? null;
    const prizeText =
      prize != null
        ? formatCost(prize, brief.currency, { compact: true })
        : brief.annualizedCost != null
          ? formatCost(brief.annualizedCost, brief.currency, { compact: true })
          : "—";
    const prizeLabel =
      prize != null
        ? "Modeled annualized saving"
        : "Annualized carrying-cost exposure";
    const action = moderate
      ? `This saving assumes recurring long dwell can be reduced toward ${formatNumber(moderate.targetDays, { maximumFractionDigits: 1 })}d; validate the long-wait events and likely lever before treating it as recoverable.`
      : "Investigate structural waiting time and handoffs to size the recoverable carrying-cost opportunity.";

    return (
      <HeroBannerShell
        prizeLabel={prizeLabel}
        prize={prizeText}
        action={action}
        ranking={ranking}
      />
    );
  }
  const target = brief.p95Days;
  const prizeText =
    target != null
      ? `${formatNumber(target, { maximumFractionDigits: 1 })}d`
      : "—";
  const action =
    brief.currentPlanDays != null && target != null
      ? brief.calibrationDirection === "tighten"
        ? "Current plan is above the candidate reference. Review whether some buffer can be released while preserving the required service level."
        : "Observed timing is above the current plan. Review whether the parameter needs more protection or whether the process driver should be addressed first."
      : "Calibrate the planning parameter once more observations are available.";
  return (
    <HeroBannerShell
      prizeLabel="Candidate planning reference"
      prize={prizeText}
      action={action}
      ranking={ranking}
    />
  );
};

const OpportunityTriggerCallout = ({
  brief,
}: {
  brief: DwellOpportunityBrief | PlanningOpportunityBrief;
}) => {
  return (
    <div className={triggerCard}>
      <div className={triggerTop}>
        <div>
          <div className={triggerEyebrow}>{brief.opportunityTrigger.label}</div>
          <div className={triggerMetric}>
            {brief.opportunityTrigger.primaryMetric}
          </div>
        </div>
        <ConfidenceBadge label={brief.confidence.label} />
      </div>
      <p className={triggerReason}>{brief.opportunityTrigger.reason}</p>
    </div>
  );
};

const RecommendedActionPlan = ({
  actions,
}: {
  actions: RecommendedAction[];
}) => {
  if (actions.length === 0) {
    return (
      <p className={nextStepsEmpty}>
        No step-type-specific recommendations are configured. Use the
        distribution and evidence rows to identify the highest-leverage levers
        manually.
      </p>
    );
  }
  return <Checklist items={actions.map((action) => action.text)} />;
};
function makeTrendChip(
  pctChange: number | null | undefined,
  previous: string | null,
): TrendChip | null {
  if (previous == null) {
    return null;
  }
  return { pctChange: pctChange ?? null, previous };
}

function findBriefNode(
  nodes: SiteNode[],
  stepId: string,
  productId: string,
): SiteNode | null {
  return (
    nodes.find(
      (node) =>
        node.id === stepId &&
        node.products.some((product) => product.id === productId),
    ) ??
    nodes.find((node) => node.id === stepId) ??
    null
  );
}

function siteDataFromSummary(
  summary: SiteSummary,
  products: Product[],
): SiteData {
  return {
    analysis_settings: summary.analysis_settings ?? null,
    graphs: summary.products.map((summaryProduct) => {
      const product = products.find(
        (candidate) => candidate.id === summaryProduct.id,
      );

      return {
        product: {
          id: summaryProduct.id,
          name: summaryProduct.name,
          material: product?.material ?? "",
        },
        graph: {
          schema_version: summary.schema_version,
          product_id: summaryProduct.id,
          product_name: summaryProduct.name,
          nodes: summaryProduct.nodes.map(ensureNodeStats),
          edges: [],
          pipeline_summary: {},
        },
      };
    }),
  };
}

function filterDetailRows(
  rows: DetailRows,
  dateKey: string,
  range: TimeRange,
): Record<string, string | number | null>[] {
  const cutoff = cutoffForRange(range);
  return rows.rows.filter((row) => {
    const value = row[dateKey];
    return typeof value !== "string" || value.slice(0, 7) >= cutoff;
  });
}

const ConfidenceCallout = ({
  brief,
}: {
  brief: DwellOpportunityBrief | PlanningOpportunityBrief;
}) => {
  return (
    <div className={confidenceCallout}>
      <h3 className={calloutTitle}>Confidence Assessment</h3>
      <p className={calloutBody}>{brief.confidence.explanation}</p>
    </div>
  );
};

function normaliseOpportunitySource(
  value: string | null,
): OpportunityBriefSourceKind {
  if (
    value === "planning_over" ||
    value === "planning_under" ||
    value === "dwell_cost"
  ) {
    return value;
  }
  return null;
}

export const OpportunityBrief = ({
  products,
  siteId,
  productId,
  stepId,
  opportunityType,
}: OpportunityBriefProps) => {
  const { timeRange } = useTimeRange();
  const { setAnalysisSettings, waccRate, storageCost } = useCostParams();
  const { excludeOutliers } = useOutlierSetting();
  const { basis: procurementBasis } = useProcurementBasis();
  const supplierPerformanceEnabled = useSupplierPerformanceEnabled();
  const [siteSummary, setSiteSummary] = useState<SiteSummary | null>(null);
  const [siteSummaryLoading, setSiteSummaryLoading] = useState(true);
  const [siteSummaryError, setSiteSummaryError] = useState<string | null>(null);
  const [step, setStep] = useState<StepDetail | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const { openDocs } = useDocs();

  // The brief only needs the precomputed site summary for node context and
  // ranking. Avoid the site overview fallback that loads every product graph.
  useEffect(() => {
    if (!siteId) {
      setSiteSummary(null);
      setSiteSummaryError(null);
      setSiteSummaryLoading(false);
      return;
    }
    let cancelled = false;
    setSiteSummaryLoading(true);
    setSiteSummaryError(null);

    fetchSiteSummary(siteId)
      .then((summary) => {
        if (!cancelled) {
          setSiteSummary(summary);
        }
      })
      .catch((event) => {
        if (!cancelled) {
          setSiteSummary(null);
          setSiteSummaryError(
            event instanceof Error ? event.message : String(event),
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSiteSummaryLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  const siteData = useMemo(
    () =>
      siteSummary && siteSummary.products.length > 0
        ? siteDataFromSummary(siteSummary, products)
        : null,
    [products, siteSummary],
  );

  useEffect(() => {
    setAnalysisSettings(siteSummary?.analysis_settings);
  }, [setAnalysisSettings, siteSummary?.analysis_settings]);

  const nodes = useMemo(
    () => (siteData ? deduplicateNodes(siteData) : []),
    [siteData],
  );
  const rollups: SiteSummaryRollups | null = siteSummary?.rollups ?? null;

  // Once the shared site nodes resolve, resolve the brief's node and fetch its
  // step detail. Shared steps use the first product carrying that deduped node;
  // product-specific downstream steps keep the requested product.
  useEffect(() => {
    if (!siteId || !productId || !stepId) {
      return;
    }
    if (siteSummaryLoading) {
      return;
    }
    let cancelled = false;
    const node = findBriefNode(nodes, stepId, productId);
    const detailProductId = node
      ? firstProductForNode(node, productId)
      : productId;
    setStep(null);
    setStepError(null);
    fetchStepDetail(detailProductId, stepId)
      .then((detail) => {
        if (!cancelled) {
          setStep(detail);
          setStepError(null);
        }
      })
      .catch((event) => {
        if (!cancelled) {
          setStepError(event instanceof Error ? event.message : String(event));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [nodes, productId, siteId, siteSummaryLoading, stepId]);

  const error = siteSummaryError ?? stepError;
  const siteNode = useMemo((): SiteNode | null => {
    const node = findBriefNode(nodes, stepId, productId);
    if (!node) {
      return null;
    }
    return {
      ...filterGraphNodeByDateRange(
        node,
        timeRange,
        excludeOutliers,
        procurementBasis,
      ),
      products: node.products,
    };
  }, [nodes, stepId, productId, timeRange, excludeOutliers, procurementBasis]);

  // Each consuming product's own (pre-dedup) node for this material/step, so the
  // brief can report per-product BOM membership and E2E binding leverage that the
  // deduped site node alone cannot carry.
  const productNodes = useMemo((): ProductNodeRef[] => {
    if (!siteData) {
      return [];
    }
    const refs: ProductNodeRef[] = [];
    for (const { product, graph } of siteData.graphs) {
      const match = graph.nodes.find((node) => {
        if (node.type !== (siteNode?.type ?? node.type)) {
          return false;
        }
        if (siteNode?.material) {
          return node.material === siteNode.material;
        }
        return node.id === stepId;
      });
      if (match) {
        refs.push({
          productId: product.id,
          productName: product.name,
          node: match,
        });
      }
    }
    return refs;
  }, [siteData, siteNode, stepId]);

  const historicalStep = useMemo(() => {
    if (!step) {
      return null;
    }
    return applyOutlierSelectionToStep(
      applyProcurementBasisToStep(step, procurementBasis),
      excludeOutliers,
    );
  }, [step, excludeOutliers, procurementBasis]);

  const filteredStep = useMemo(() => {
    if (!step) {
      return null;
    }
    return filterStepByDateRange(
      step,
      timeRange,
      excludeOutliers,
      procurementBasis,
    );
  }, [step, timeRange, excludeOutliers, procurementBasis]);

  const brief = useMemo(() => {
    if (!filteredStep || !historicalStep) {
      return null;
    }
    if (opportunityType === "dwell") {
      return buildDwellOpportunityBrief(
        filteredStep,
        historicalStep,
        timeRange,
        { waccRate, storageCost },
        { siteNode, productNodes },
      );
    }
    return buildPlanningOpportunityBrief(
      filteredStep,
      historicalStep,
      timeRange,
      normaliseOpportunitySource(searchParams.get("op")),
    );
  }, [
    filteredStep,
    historicalStep,
    opportunityType,
    timeRange,
    waccRate,
    storageCost,
    searchParams,
    siteNode,
    productNodes,
  ]);

  const evidence = useMemo(() => {
    if (!filteredStep?.detail_rows) {
      return null;
    }
    const dateKey = detailDateKeyFromColumns(
      filteredStep.detail_rows,
      filteredStep.ref_date_col,
    );
    const rows = dateKey
      ? filterDetailRows(filteredStep.detail_rows, dateKey, timeRange)
      : filteredStep.detail_rows.rows;
    return { detailRows: filteredStep.detail_rows, rows, dateKey };
  }, [filteredStep, timeRange]);

  const briefTelemetryProperties = useMemo(
    () => ({
      opportunityType,
      productId,
      siteId,
      source: "opportunity_brief",
      stepId,
    }),
    [opportunityType, productId, siteId, stepId],
  );

  const handleEvidenceDownload = useCallback(() => {
    if (!evidence || !filteredStep) {
      return;
    }
    trackSupplyChainInteraction({
      ...briefTelemetryProperties,
      interaction: "opportunity_brief_data_downloaded",
    });
    const csv = buildCsvContent(evidence.detailRows.columns, evidence.rows);
    downloadCsv(
      csv,
      `${filteredStep.id}_${opportunityType}_brief_evidence.csv`,
    );
  }, [briefTelemetryProperties, evidence, filteredStep, opportunityType]);

  const handlePrint = useCallback(() => {
    trackSupplyChainInteraction({
      ...briefTelemetryProperties,
      interaction: "opportunity_brief_print_clicked",
    });
    window.print();
  }, [briefTelemetryProperties]);

  if (error) {
    return <ErrorState message={error} className={errorPad} />;
  }

  if (siteSummaryLoading || !step) {
    return <SupplyChainAppSkeleton />;
  }

  if (!filteredStep || !historicalStep || !brief) {
    return (
      <ErrorState
        message="Opportunity data was not found."
        className={errorPad}
      />
    );
  }

  const productsForStep =
    siteNode?.products ??
    products.filter((product) => product.id === productId);
  const isDwellBrief = brief.kind === "dwell";
  const ranking = computeBriefRanking(rollups, stepId, isDwellBrief);

  // Headline period-over-period trends for median / P95 / cost (newest vs prior window).
  const periodCmp = computePeriodDeltas(historicalStep.observations, timeRange);
  const prevStats = periodCmp.previousStats;
  const costCmp = isDwellBrief
    ? computeCostComparison(
        historicalStep.monthly,
        historicalStep.cost?.unit_price,
        waccRate,
        storageCost,
        timeRange,
      )
    : null;

  const minTrend = makeTrendChip(
    periodCmp.statDeltas.min,
    prevStats
      ? `${formatNumber(prevStats.min, { maximumFractionDigits: 1 })}d`
      : null,
  );
  const medianTrend = makeTrendChip(
    periodCmp.statDeltas.median,
    prevStats
      ? `${formatNumber(prevStats.median, { maximumFractionDigits: 1 })}d`
      : null,
  );

  const p95Trend = makeTrendChip(
    periodCmp.statDeltas.p95,
    prevStats
      ? `${formatNumber(prevStats.p95, { maximumFractionDigits: 1 })}d`
      : null,
  );

  const maxTrend = makeTrendChip(
    periodCmp.statDeltas.max,
    prevStats
      ? `${formatNumber(prevStats.max, { maximumFractionDigits: 1 })}d`
      : null,
  );

  const costTrend =
    isDwellBrief && costCmp
      ? makeTrendChip(
          costCmp.delta,
          costCmp.previousTotal != null
            ? formatCost(costCmp.previousTotal, brief.currency, {
                compact: true,
              })
            : null,
        )
      : undefined;

  return (
    <div className={briefScrollArea}>
      <style>{`
        @page {
          margin: 14mm;
        }

        @media print {
          html,
          body {
            background: #fff !important;
            height: auto !important;
            overflow: visible !important;
          }

          body * {
            contain: none !important;
            max-height: none !important;
            overflow: visible !important;
            transform: none !important;
            visibility: hidden;
          }

          body *:has(.opportunity-brief-print) {
            margin: 0 !important;
            max-width: none !important;
            overflow: visible !important;
            padding: 0 !important;
            position: static !important;
            transform: none !important;
            width: auto !important;
          }

          .opportunity-brief-print,
          .opportunity-brief-print * {
            visibility: visible;
          }

          .opportunity-brief-print {
            background: #fff;
            box-sizing: border-box;
            margin: 0 !important;
            max-width: none !important;
            padding: 0 !important;
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 100% !important;
          }

          .no-print {
            display: none !important;
          }
        }
      `}</style>
      <article className={cx("opportunity-brief-print", article)}>
        <div className={cx("no-print", topBar)}>
          <div className={topActions}>
            <DocsIconButton
              label="Open opportunity brief documentation"
              onClick={() => openDocs("opportunity-brief")}
            />

            {evidence && evidence.rows.length > 0 && (
              <Button
                variant="subtle"
                tone="neutral"
                size="sm"
                iconName="download"
                onClick={handleEvidenceDownload}
              >
                Evidence CSV
              </Button>
            )}
            <Button
              variant="solid"
              tone="neutral"
              size="sm"
              iconName="print"
              onClick={handlePrint}
            >
              Print / Save as PDF
            </Button>
          </div>
        </div>

        <header className={headerEl}>
          <div className={eyebrow}>
            <span>Opportunity Brief</span>
            <span className={eyebrowDot} />
            <span>
              {isDwellBrief
                ? "Dwell cost reduction"
                : "Planning parameter calibration"}
            </span>
            <span className={eyebrowDot} />
            <span>{timeRangeLongLabel(timeRange)}</span>
          </div>
          <h1 className={h1}>{filteredStep.label}</h1>
          <div className={metaGrid}>
            <div className={metaStack}>
              <MetaLine
                label="Plant"
                value={siteNode?.plant ?? siteId.toUpperCase()}
              />

              <MetaLine
                label="Analysis assumptions"
                value={
                  isDwellBrief
                    ? `${formatNumber(waccRate * 100, { maximumFractionDigits: 0 })}% WACC, ${formatNumber(storageCost, { maximumFractionDigits: 3 })}${filteredStep.cost?.currency ? ` ${filteredStep.cost.currency}` : ""}/t/day storage, ${excludeOutliers ? "outliers excluded" : "outliers included"}`
                    : excludeOutliers
                      ? "outliers excluded"
                      : "outliers included"
                }
              />
            </div>
            <MetaLine
              label="Products"
              value={productsForStep.map((product) => product.name).join(", ")}
            />
          </div>
        </header>

        <HeroBanner brief={brief} ranking={ranking} />

        <section className={metricsSection}>
          <MetricCard
            label="Min"
            value={`${formatNumber(filteredStep.stats.min, { maximumFractionDigits: 1 })}d`}
            trend={minTrend}
          />

          <MetricCard
            label="Observed median"
            value={`${formatNumber(filteredStep.stats.median, { maximumFractionDigits: 1 })}d`}
            trend={medianTrend}
          />

          <MetricCard
            label="P95"
            value={`${formatNumber(filteredStep.stats.p95, { maximumFractionDigits: 1 })}d`}
            trend={p95Trend}
          />

          <MetricCard
            label="Max"
            value={`${formatNumber(filteredStep.stats.max, { maximumFractionDigits: 1 })}d`}
            trend={maxTrend}
          />

          <MetricCard
            label="Observations"
            value={formatNumber(filteredStep.stats.n)}
          />

          <MetricCard
            label={isDwellBrief ? `Cost (${timeRange})` : "Current plan"}
            value={
              isDwellBrief
                ? formatCost(brief.periodCost, brief.currency, {
                    compact: true,
                  })
                : `${formatNumber(brief.currentPlanDays, { maximumFractionDigits: 1 })}d`
            }
            trend={costTrend}
          />
        </section>

        <BriefSection title="Executive Summary">
          <OpportunityTriggerCallout brief={brief} />
          {isDwellBrief ? (
            <DwellExecutiveSummary brief={brief} timeRange={timeRange} />
          ) : (
            <PlanningExecutiveSummary brief={brief} />
          )}
        </BriefSection>

        <BriefSection title="Opportunity Diagnosis">
          <BulletList items={brief.diagnosis} />
          <ConfidenceCallout brief={brief} />
        </BriefSection>

        {isDwellBrief ? (
          <DwellImpactSection brief={brief} currency={brief.currency} />
        ) : (
          <PlanningRecommendationSection brief={brief} />
        )}

        {isDwellBrief && <E2ELeverageSection brief={brief} />}

        {isDwellBrief && <PerProductImpactSection brief={brief} />}

        {isDwellBrief && brief.firstUseDwell && (
          <FirstUseDwellSection
            firstUse={brief.firstUseDwell}
            verb={
              filteredStep.type === "intermediate_dwell" ? "produce" : "order"
            }
          />
        )}

        {supplierPerformanceEnabled && brief.supplier && (
          <SupplierSection supplier={brief.supplier} />
        )}

        {brief.productionInsight && (
          <ProductionInsightSection insight={brief.productionInsight} />
        )}

        <BriefSection title="Distribution and evidence">
          <div className={chartsGrid}>
            <BriefBoxPlot stats={filteredStep.stats} plan={filteredStep.plan} />
            <BriefHistogram values={filteredStep.durations} />
            <BriefSparkline
              label="Monthly median trend"
              points={filteredStep.monthly
                .map((month) => month.median ?? month.mean)
                .filter((value): value is number => value != null)}
            />
          </div>
          <div className={distGrid}>
            <StatTable
              rows={[
                [
                  "Min",
                  `${formatNumber(filteredStep.stats.min, { maximumFractionDigits: 1 })}d`,
                ],

                [
                  "Mean",
                  `${formatNumber(filteredStep.stats.mean, { maximumFractionDigits: 1 })}d`,
                ],

                [
                  "Median",
                  `${formatNumber(filteredStep.stats.median, { maximumFractionDigits: 1 })}d`,
                ],

                [
                  "P75",
                  `${formatNumber(filteredStep.stats.p75, { maximumFractionDigits: 1 })}d`,
                ],

                [
                  "P85",
                  `${formatNumber(filteredStep.stats.p85, { maximumFractionDigits: 1 })}d`,
                ],

                [
                  "P95",
                  `${formatNumber(filteredStep.stats.p95, { maximumFractionDigits: 1 })}d`,
                ],

                [
                  "Max",
                  `${formatNumber(filteredStep.stats.max, { maximumFractionDigits: 1 })}d`,
                ],

                [
                  "Std dev",
                  `${formatNumber(filteredStep.stats.std, { maximumFractionDigits: 1 })}d`,
                ],
              ]}
            />

            <StatTable
              rows={[
                ["Samples", formatNumber(filteredStep.stats.n)],
                [
                  "Trend vs previous period",
                  formatTrendSummary(brief.trend, timeRange),
                ],

                [
                  "Exceeded plan",
                  filteredStep.pct_exceeding_plan == null
                    ? "-"
                    : `${formatNumber(filteredStep.pct_exceeding_plan, { maximumFractionDigits: 0 })}%`,
                ],

                [
                  "Outliers excluded",
                  filteredStep.excluded_count == null
                    ? "-"
                    : formatNumber(filteredStep.excluded_count),
                ],

                [
                  "Evidence rows",
                  evidence ? formatNumber(evidence.rows.length) : "-",
                ],

                [
                  "Highest cost month",
                  isDwellBrief ? (
                    <HighestCostMonthValue
                      key="highest-cost-month"
                      brief={brief}
                    />
                  ) : (
                    "-"
                  ),
                ],
              ]}
            />
          </div>
          <TopEvidenceTable rows={brief.topEvidence} />
          {/* {brief.provenance && (
            <p className={provenanceText}>Source: {brief.provenance}</p>
          )} */}
          {brief.normalizationNote && (
            <p className={provenanceText}>{brief.normalizationNote}</p>
          )}
        </BriefSection>

        <BriefSection title="Recommended Investigation Plan">
          <RecommendedActionPlan actions={brief.recommendedActions} />
        </BriefSection>

        <BriefSection title="Assumptions And Caveats">
          <BulletList
            items={[
              "This brief is an investigation aid, not an automatic process prescription.",
              "Savings estimates assume carrying cost scales with kg-days and that volume/mix remains broadly comparable.",
              "Planning recommendations are calibration candidates; final parameters should reflect the desired service level and business tolerance for late events.",
              "Evidence rows should be used to validate affected batches, materials, and months before action.",
            ]}
          />
        </BriefSection>
      </article>
    </div>
  );
};
