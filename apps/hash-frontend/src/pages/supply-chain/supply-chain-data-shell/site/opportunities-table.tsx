import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Tooltip } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { StatusActionButton } from "../../shared/action-buttons";
import { STEP_TYPE_LABELS, STEP_TYPE_ORDER } from "../../shared/categories";
import { PlanningWarningIndicator } from "../../shared/planning-warning-indicator";
import {
  compareStatusLabels,
  deriveStatusActionState,
  STATUS_LABELS_IN_ORDER,
  statusKey,
  statusLabelForNode,
  type StatusActionLabel,
  type StatusStore,
} from "../../shared/status";
import { trackSupplyChainInteraction } from "../../shared/telemetry";
import { buildColumnFilter, countBy } from "./shared/column-filter";
import { ColumnHeader } from "./shared/column-header";
import { ProductTags } from "./shared/product-tags";
import * as threshold from "./shared/table-styles";

import type { SiteNode, StepType } from "../../shared/types";
import type { OpportunityKind, SiteOpportunity } from "./opportunities";
import type { SortDir, SortKey } from "./shared/row-types";

// Caps its own height to ~the viewport and scrolls internally: the header band
// stays pinned (flexShrink:0) and the table body scrolls beneath it. `minH:0`
// on `tableScroll` lets that pane shrink below its content height.
const TABLE_MAX_HEIGHT = "calc(100dvh - 7rem - 100px)";
const card = css({
  display: "flex",
  flexDirection: "column",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "lg",
  bg: "bgSolid.min",
  overflow: "hidden",
});
const header = css({
  flexShrink: "0",
  px: "4",
  py: "3",
  borderBottomWidth: "1px",
  borderColor: "bd.subtle",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  flexWrap: "wrap",
});
const tableScroll = css({ flex: "1", minH: "0", overflow: "auto" });
const titleWrap = css({ display: "flex", flexDirection: "column", gap: "0.5" });
const title = css({
  textStyle: "base",
  fontWeight: "semibold",
  color: "fg.heading",
});
const subtitle = css({ textStyle: "xs", color: "fg.subtle" });
const typePill = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  borderRadius: "full",
  px: "2",
  py: "0.5",
  textStyle: "xxs",
  fontWeight: "medium",
  bg: "bg.subtle",
  color: "fg.muted",
  whiteSpace: "nowrap",
});
const pillDwell = css({ color: "[#92400e]", bg: "[#fffbeb]" });
const pillBad = css({
  color: "status.error.fg.body",
  bg: "status.error.bg.subtle",
});
const pillGood = css({
  color: "status.success.fg.body",
  bg: "status.success.bg.subtle",
});
const titleCell = css({ display: "flex", flexDirection: "column", gap: "1" });
const titleLine = css({ display: "flex", alignItems: "center", gap: "1.5" });
const titleText = css({ fontWeight: "medium", color: "fg.heading" });
const impactBase = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "1",
  fontWeight: "semibold",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
});
const impactLabel = css({
  textStyle: "xs",
  color: "fg.subtle",
  whiteSpace: "nowrap",
});
const impactDanger = css({ color: "status.error.fg.body" });
const impactSuccess = css({ color: "status.success.fg.body" });
const impactNeutral = css({ color: "fg.heading" });
const actionWrap = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "1.5",
  flexWrap: "nowrap",
});
const tooltipLines = css({
  display: "flex",
  flexDirection: "column",
  gap: "0.5",
  textAlign: "left",
});
const sampleBadge = css({
  display: "inline-flex",
  alignSelf: "flex-start",
  borderRadius: "full",
  px: "2",
  py: "0.5",
  textStyle: "xxs",
  fontWeight: "medium",
  whiteSpace: "nowrap",
  cursor: "default",
});
const sampleGood = css({
  color: "status.success.fg.body",
  bg: "status.success.bg.subtle",
});
const sampleBad = css({
  color: "status.error.fg.body",
  bg: "status.error.bg.subtle",
});
// Header cells stick to the top of the scroll area. A single table (shared with
// the body) keeps the header columns aligned with the rows.
const oppTh = css({
  position: "sticky",
  top: "0",
  zIndex: "[3]",
  bg: "[#fafafa]",
  borderBottomWidth: "1px",
  borderColor: "[#d9d9d9]",
  px: "4",
  py: "2.5",
  fontWeight: "medium",
  whiteSpace: "nowrap",
});
const oppThRight = css({
  position: "sticky",
  top: "0",
  zIndex: "[3]",
  bg: "[#fafafa]",
  borderBottomWidth: "1px",
  borderColor: "[#d9d9d9]",
  px: "4",
  py: "2.5",
  fontWeight: "medium",
  textAlign: "right",
  whiteSpace: "nowrap",
});
// Section header row: a full-width cell that sticks just below the header row.
const sectionHeader = css({
  position: "sticky",
  top: "[37px]",
  zIndex: "[2]",
  px: "4",
  py: "2",
  borderTopWidth: "1px",
  borderBottomWidth: "1px",
});
const sectionButton = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "2",
  w: "full",
  textAlign: "left",
  textStyle: "xs",
  fontWeight: "semibold",
  cursor: "pointer",
});
const sectionCount = css({ color: "fg.subtle", fontWeight: "medium" });
const caret = css({ transition: "[transform 160ms ease]", flexShrink: 0 });
const caretClosed = css({ transform: "rotate(-90deg)" });
const dwellSection = css({
  bg: "[#fffbeb]",
  color: "[#92400e]",
  borderColor: "[#f59e0b]",
});
const overSection = css({
  bg: "[#fef2f2]",
  color: "status.error.fg.body",
  borderColor: "[#fecaca]",
});
const underSection = css({
  bg: "[#f0fdf4]",
  color: "status.success.fg.body",
  borderColor: "[#bbf7d0]",
});

type OpportunitySection = {
  id: OpportunityKind;
  label: string;
  kinds: OpportunityKind[];
};

const OPPORTUNITY_SECTIONS: OpportunitySection[] = [
  { id: "dwell_cost", label: "Dwell", kinds: ["dwell_cost"] },
  { id: "planning_over", label: "Over plan", kinds: ["planning_over"] },
  { id: "planning_under", label: "Under plan", kinds: ["planning_under"] },
];

interface OpportunitiesTableProps {
  opportunities: SiteOpportunity[];
  /** Route site slug; scopes status keys to the global store. */
  siteId: string;
  statusHistory?: StatusStore;
  onRowClick: (opportunity: SiteOpportunity) => void;
  onStatus: (node: SiteNode, title: string) => void;
  sort: { key: SortKey; dir: SortDir } | null;
  onSort: (next: { key: SortKey; dir: SortDir }) => void;
  typeHidden: Set<StepType>;
  onTypeHiddenChange: (next: Set<StepType>) => void;
  productHidden: Set<string>;
  onProductHiddenChange: (next: Set<string>) => void;
  statusHidden: Set<StatusActionLabel>;
  onStatusHiddenChange: (next: Set<StatusActionLabel>) => void;
  revealSectionRequest?: {
    kind: OpportunityKind;
    requestId: number;
  } | null;
}

const OpportunityColGroup = () => {
  return (
    <colgroup>
      <col style={{ width: "1%" }} />
      <col />
      <col style={{ width: "1%" }} />
      <col style={{ width: "1%" }} />
      <col style={{ width: "1%" }} />
    </colgroup>
  );
};

function sectionClass(kind: OpportunityKind): string {
  if (kind === "dwell_cost") {
    return dwellSection;
  }
  if (kind === "planning_over") {
    return overSection;
  }
  return underSection;
}

const CaretIcon = ({ className }: { className?: string }) => {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M2.5 3.75 5 6.25l2.5-2.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

function pillClass(kind: OpportunityKind): string {
  if (kind === "dwell_cost") {
    return pillDwell;
  }
  if (kind === "planning_over") {
    return pillBad;
  }
  return pillGood;
}

function sampleTooltip(opportunity: SiteOpportunity) {
  return (
    <span className={tooltipLines}>
      <span>Observations this period: {opportunity.currentSampleN}</span>
      {opportunity.previousSampleN != null &&
        opportunity.previousSampleN > 0 && (
          <span>Observations last period: {opportunity.previousSampleN}</span>
        )}
    </span>
  );
}

function sampleClass(label: string): string {
  if (label === "Good sample") {
    return sampleGood;
  }
  return sampleBad;
}

function sortOpportunities(
  items: SiteOpportunity[],
  sort: { key: SortKey; dir: SortDir } | null,
  statusOf: (opportunity: SiteOpportunity) => StatusActionLabel,
): SiteOpportunity[] {
  if (!sort) {
    return items;
  }
  if (sort.key === "opportunity") {
    return [...items].sort((left, right) =>
      sort.dir === "desc"
        ? right.title.localeCompare(left.title)
        : left.title.localeCompare(right.title),
    );
  }
  if (sort.key === "status") {
    return [...items].sort((left, right) => {
      const cmp = compareStatusLabels(statusOf(left), statusOf(right));
      return sort.dir === "desc" ? -cmp : cmp;
    });
  }
  if (sort.key === "impact") {
    return [...items].sort((left, right) =>
      sort.dir === "desc" ? right.score - left.score : left.score - right.score,
    );
  }
  return items;
}

export const OpportunitiesTable = ({
  opportunities,
  siteId,
  statusHistory = {},
  onRowClick,
  onStatus,
  sort,
  onSort,
  typeHidden,
  onTypeHiddenChange,
  productHidden,
  onProductHiddenChange,
  statusHidden,
  onStatusHiddenChange,
  revealSectionRequest,
}: OpportunitiesTableProps) => {
  const [collapsedSections, setCollapsedSections] = useState<
    Set<OpportunityKind>
  >(() => new Set());
  const sectionRefs = useRef<
    Partial<Record<OpportunityKind, HTMLTableSectionElement | null>>
  >({});

  useEffect(() => {
    if (!revealSectionRequest) {
      return;
    }

    const { kind } = revealSectionRequest;
    setCollapsedSections((previousSections) => {
      if (!previousSections.has(kind)) {
        return previousSections;
      }
      const nextSections = new Set(previousSections);
      nextSections.delete(kind);
      return nextSections;
    });

    const animationFrame = requestAnimationFrame(() => {
      sectionRefs.current[kind]?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [revealSectionRequest]);

  const statusOf = useCallback(
    (opportunity: SiteOpportunity): StatusActionLabel =>
      statusLabelForNode(siteId, opportunity.node, statusHistory),
    [siteId, statusHistory],
  );

  const typeFilter = useMemo(() => {
    const values = STEP_TYPE_ORDER.filter((stepType) =>
      opportunities.some((opportunity) => opportunity.node.type === stepType),
    );
    return buildColumnFilter<StepType>({
      header: "Step type",
      values,
      labelOf: (stepType) => STEP_TYPE_LABELS[stepType],
      counts: countBy(opportunities, (opportunity) => opportunity.node.type),
      hidden: typeHidden,
      onHiddenChange: onTypeHiddenChange,
      searchable: false,
    });
  }, [opportunities, typeHidden, onTypeHiddenChange]);

  const productFilter = useMemo(() => {
    const names = new Map<string, string>();
    const counts = new Map<string, number>();
    for (const opportunity of opportunities) {
      for (const product of opportunity.products) {
        names.set(product.id, product.name);
        counts.set(product.id, (counts.get(product.id) ?? 0) + 1);
      }
    }
    const values = [...names.keys()].sort((left, right) =>
      (names.get(left) ?? "").localeCompare(names.get(right) ?? ""),
    );
    return buildColumnFilter<string>({
      header: "Product",
      values,
      labelOf: (id) => names.get(id) ?? id,
      counts,
      hidden: productHidden,
      onHiddenChange: onProductHiddenChange,
    });
  }, [opportunities, productHidden, onProductHiddenChange]);

  const statusFilter = useMemo(() => {
    const values = STATUS_LABELS_IN_ORDER.filter((label) =>
      opportunities.some((opportunity) => statusOf(opportunity) === label),
    );
    return buildColumnFilter<StatusActionLabel>({
      header: "Status",
      values,
      labelOf: (label) => label,
      counts: countBy(opportunities, statusOf),
      hidden: statusHidden,
      onHiddenChange: onStatusHiddenChange,
      searchable: false,
    });
  }, [opportunities, statusHidden, onStatusHiddenChange, statusOf]);

  const grouped = useMemo(() => {
    const passesProduct = (opportunity: SiteOpportunity) =>
      opportunity.products.length === 0 ||
      opportunity.products.some((product) => !productHidden.has(product.id));
    const passesStatus = (opportunity: SiteOpportunity) =>
      !statusHidden.has(statusOf(opportunity));

    return OPPORTUNITY_SECTIONS.map((section) => {
      const items = opportunities.filter(
        (opportunity) =>
          section.kinds.includes(opportunity.kind) &&
          !typeHidden.has(opportunity.node.type) &&
          passesProduct(opportunity) &&
          passesStatus(opportunity),
      );
      return {
        ...section,
        opportunities: sortOpportunities(items, sort, statusOf),
      };
    });
  }, [opportunities, typeHidden, productHidden, statusHidden, statusOf, sort]);

  const toggleSort = (key: SortKey) => {
    if (sort?.key === key) {
      onSort({ key, dir: sort.dir === "desc" ? "asc" : "desc" });
    } else {
      onSort({
        key,
        dir: key === "opportunity" || key === "status" ? "asc" : "desc",
      });
    }
  };

  const toggleSection = (section: OpportunityKind) => {
    trackSupplyChainInteraction({
      interaction: "opportunity_section_toggled",
      opportunityKind: section,
      source: "opportunities_table",
    });
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const visibleCount = grouped.reduce(
    (sum, section) => sum + section.opportunities.length,
    0,
  );
  return (
    <section className={card} style={{ maxHeight: TABLE_MAX_HEIGHT }}>
      <style>{`
        @keyframes opportunityRowsIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div className={header}>
        <div className={titleWrap}>
          <h2 className={title}>Opportunities</h2>
          <p className={subtitle}>
            {visibleCount} visible of {opportunities.length} generated from
            dwell cost and planning variance.
          </p>
        </div>
      </div>
      <div className={tableScroll}>
        <table className={threshold.table}>
          <OpportunityColGroup />
          <thead>
            <tr className={threshold.theadRow}>
              <th className={oppTh}>
                <ColumnHeader label="Type" filter={typeFilter} />
              </th>
              <th className={oppTh}>
                <ColumnHeader
                  label="Opportunity"
                  sort={{
                    active: sort?.key === "opportunity",
                    dir: sort?.dir ?? "asc",
                    onToggle: () => toggleSort("opportunity"),
                  }}
                  filter={productFilter}
                />
              </th>
              <th className={oppThRight}>
                <ColumnHeader
                  label="Impact"
                  sort={{
                    active: sort?.key === "impact",
                    dir: sort?.dir ?? "desc",
                    onToggle: () => toggleSort("impact"),
                  }}
                />
              </th>
              <th className={oppThRight}>Sample</th>
              <th className={oppThRight}>
                <ColumnHeader
                  label="Status"
                  sort={{
                    active: sort?.key === "status",
                    dir: sort?.dir ?? "asc",
                    onToggle: () => toggleSort("status"),
                  }}
                  filter={statusFilter}
                />
              </th>
            </tr>
          </thead>
          {grouped.map((section) => (
            <tbody
              key={section.id}
              ref={(element) => {
                sectionRefs.current[section.id] = element;
              }}
              className={threshold.tbodyDivide}
            >
              <tr>
                <td
                  colSpan={5}
                  className={cx(sectionHeader, sectionClass(section.id))}
                >
                  <button
                    type="button"
                    className={sectionButton}
                    aria-expanded={!collapsedSections.has(section.id)}
                    onClick={() => toggleSection(section.id)}
                  >
                    <CaretIcon
                      className={cx(
                        caret,
                        collapsedSections.has(section.id) && caretClosed,
                      )}
                    />

                    <span>{section.label}</span>
                    <span className={sectionCount}>
                      {section.opportunities.length}
                    </span>
                  </button>
                </td>
              </tr>
              {!collapsedSections.has(section.id) &&
                section.opportunities.map((opportunity) => {
                  const key = statusKey(opportunity.siteId, opportunity.node);
                  return (
                    <tr
                      key={opportunity.id}
                      className={threshold.bodyRow}
                      style={{
                        animation:
                          "opportunityRowsIn 320ms cubic-bezier(0.2, 0, 0, 1)",
                      }}
                      tabIndex={0}
                      onClick={() => onRowClick(opportunity)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          onRowClick(opportunity);
                        }
                      }}
                    >
                      <td className={threshold.td}>
                        <span
                          className={cx(typePill, pillClass(opportunity.kind))}
                        >
                          {opportunity.typeLabel}
                        </span>
                      </td>
                      <td className={threshold.td}>
                        <div className={titleCell}>
                          <div className={titleLine}>
                            <span className={titleText}>
                              {opportunity.title}
                            </span>
                            {opportunity.node.type === "procurement" && (
                              <PlanningWarningIndicator
                                warnings={opportunity.node.planning_warnings}
                              />
                            )}
                          </div>
                          <ProductTags products={opportunity.products} />
                        </div>
                      </td>
                      <td className={threshold.tdRight}>
                        <span
                          className={cx(
                            impactBase,
                            opportunity.impactTone === "danger"
                              ? impactDanger
                              : opportunity.impactTone === "success"
                                ? impactSuccess
                                : impactNeutral,
                          )}
                          title={opportunity.evidence}
                        >
                          {opportunity.impactValue}
                        </span>
                        <div
                          className={impactLabel}
                          title={opportunity.evidence}
                        >
                          {opportunity.impactLabel}
                        </div>
                      </td>
                      <td className={threshold.tdRight}>
                        <Tooltip
                          content={sampleTooltip(opportunity)}
                          position="top"
                          openDelay="fast"
                        >
                          <span
                            className={cx(
                              sampleBadge,
                              sampleClass(opportunity.confidenceLabel),
                            )}
                          >
                            {opportunity.confidenceLabel}
                          </span>
                        </Tooltip>
                      </td>
                      <td className={threshold.tdRight}>
                        <div className={actionWrap}>
                          <StatusActionButton
                            state={deriveStatusActionState(statusHistory[key])}
                            onClick={(event) => {
                              event.stopPropagation();
                              onStatus(opportunity.node, opportunity.title);
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          ))}
          {visibleCount === 0 && (
            <tbody className={threshold.tbodyDivide}>
              <tr>
                <td colSpan={5} className={threshold.emptyCell}>
                  {opportunities.length === 0
                    ? "No opportunities have been generated for this site yet."
                    : "No opportunities match the current filters. Try resetting filters."}
                </td>
              </tr>
            </tbody>
          )}
        </table>
      </div>
    </section>
  );
};
