import { useMemo, useState } from "react";

import { Tooltip } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import {
  BriefLink,
  StatusActionButton,
  NeutralActionButton,
} from "../../shared/action-buttons";
import { statusKey } from "./opportunities";
import { ProductTags } from "./shared/product-tags";
import * as threshold from "./shared/table-styles";

import type { SiteNode } from "../../shared/types";
import type {
  OpportunityKind,
  OpportunityStatuses,
  SiteOpportunity,
} from "./opportunities";

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
const controls = css({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "2",
});
const checkboxLabel = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  mr: "2",
  textStyle: "xs",
  color: "fg.subtle",
  cursor: "pointer",
});
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
const markReadButton = css({
  color: "status.success.fg.body",
  borderColor: "status.success.bd.subtle",
  bg: "status.success.bg.subtle",
  _hover: {
    color: "status.success.fg.body",
    borderColor: "status.success.bd.subtle",
  },
});
const markUnreadButton = css({
  color: "fg.muted",
  borderColor: "bd.subtle",
  bg: "bg.subtle",
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
const headerTable = css({
  position: "sticky",
  top: "0",
  zIndex: "[3]",
  bg: "[#fafafa]",
});
const oppTh = css({
  bg: "[#fafafa]",
  borderBottomWidth: "1px",
  borderColor: "[#d9d9d9]",
  px: "4",
  py: "2.5",
  fontWeight: "medium",
  whiteSpace: "nowrap",
});
const oppThRight = css({
  bg: "[#fafafa]",
  borderBottomWidth: "1px",
  borderColor: "[#d9d9d9]",
  px: "4",
  py: "2.5",
  fontWeight: "medium",
  textAlign: "right",
  whiteSpace: "nowrap",
});
const sectionBlock = css({ position: "relative" });
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
  statuses: OpportunityStatuses;
  onRowClick: (node: SiteNode) => void;
  onMarkRead: (id: string) => void;
  onMarkUnread: (id: string) => void;
  onStatus: (node: SiteNode, title: string) => void;
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

function sectionClass(kind: OpportunityKind): string | undefined {
  if (kind === "dwell_cost") {
    return dwellSection;
  }
  if (kind === "planning_over") {
    return overSection;
  }
  return underSection;
  return undefined;
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

function pillClass(kind: OpportunityKind): string | undefined {
  if (kind === "dwell_cost") {
    return pillDwell;
  }
  if (kind === "planning_over") {
    return pillBad;
  }
  return pillGood;
  return undefined;
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

function sampleBadgeLabel(label: string): string {
  if (label === "Low sample") {
    return "low";
  }
  return label;
}

const UnreadIcon = () => {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 3 9 9M9 3 3 9"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
};

const ReadIcon = () => {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2 6.2 4.7 9 10 3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
export const OpportunitiesTable = ({
  opportunities,
  statuses,
  onRowClick,
  onMarkRead,
  onMarkUnread,
  onStatus,
}: OpportunitiesTableProps) => {
  const [showRead, setShowRead] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<
    Set<OpportunityKind>
  >(() => new Set());
  const visibleOpportunities = useMemo(() => {
    return opportunities.filter(
      (opportunity) =>
        showRead ||
        !statuses[statusKey(opportunity.siteId, opportunity.node)]?.read,
    );
  }, [opportunities, showRead, statuses]);
  const grouped = useMemo(() => {
    return OPPORTUNITY_SECTIONS.map((section) => ({
      ...section,
      opportunities: visibleOpportunities.filter((opportunity) =>
        section.kinds.includes(opportunity.kind),
      ),
    }));
  }, [visibleOpportunities]);
  const toggleSection = (section: OpportunityKind) => {
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
  const unreadCount = opportunities.filter(
    (opportunity) =>
      !statuses[statusKey(opportunity.siteId, opportunity.node)]?.read,
  ).length;
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
            {unreadCount} unread of {opportunities.length} generated from dwell
            cost and planning variance.
          </p>
        </div>
        <div className={controls}>
          <label className={checkboxLabel}>
            <input
              type="checkbox"
              checked={showRead}
              onChange={(event) => setShowRead(event.target.checked)}
            />
            Show read
          </label>
        </div>
      </div>
      <div className={tableScroll}>
        <table className={cx(threshold.table, headerTable)}>
          <OpportunityColGroup />
          <thead>
            <tr className={threshold.theadRow}>
              <th className={oppTh}>Type</th>
              <th className={oppTh}>Opportunity</th>
              <th className={oppThRight}>Impact</th>
              <th className={oppTh}>Sample</th>
              <th className={oppThRight}>Actions</th>
            </tr>
          </thead>
        </table>
        {grouped.map((section) => (
          <section key={section.id} className={sectionBlock}>
            <div className={cx(sectionHeader, sectionClass(section.id))}>
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
            </div>
            {!collapsedSections.has(section.id) && (
              <table className={threshold.table}>
                <OpportunityColGroup />
                <tbody className={threshold.tbodyDivide}>
                  {section.opportunities.map((opportunity) => {
                    const key = statusKey(opportunity.siteId, opportunity.node);
                    const status = statuses[key];
                    return (
                      <tr
                        key={opportunity.id}
                        className={threshold.bodyRow}
                        style={{
                          animation:
                            "opportunityRowsIn 320ms cubic-bezier(0.2, 0, 0, 1)",
                        }}
                        tabIndex={0}
                        onClick={() => onRowClick(opportunity.node)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            onRowClick(opportunity.node);
                          }
                        }}
                      >
                        <td className={threshold.td}>
                          <span
                            className={cx(
                              typePill,
                              pillClass(opportunity.kind),
                            )}
                          >
                            {opportunity.typeLabel}
                          </span>
                        </td>
                        <td className={threshold.td}>
                          <div className={titleCell}>
                            <span className={titleText}>
                              {opportunity.title}
                            </span>
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
                        <td className={threshold.td}>
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
                              {sampleBadgeLabel(opportunity.confidenceLabel)}
                            </span>
                          </Tooltip>
                        </td>
                        <td className={threshold.tdRight}>
                          <div className={actionWrap}>
                            {opportunity.briefHref && (
                              <BriefLink
                                href={opportunity.briefHref}
                                onClick={(event) => event.stopPropagation()}
                              />
                            )}
                            <StatusActionButton
                              onClick={(event) => {
                                event.stopPropagation();
                                onStatus(opportunity.node, opportunity.title);
                              }}
                            />

                            <NeutralActionButton
                              className={
                                status?.read ? markUnreadButton : markReadButton
                              }
                              icon={
                                status?.read ? <UnreadIcon /> : <ReadIcon />
                              }
                              onClick={(event) => {
                                event.stopPropagation();
                                if (status?.read) {
                                  onMarkUnread(key);
                                } else {
                                  onMarkRead(key);
                                }
                              }}
                            >
                              {status?.read ? "Mark unread" : "Mark read"}
                            </NeutralActionButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        ))}
        {visibleCount === 0 && (
          <table className={threshold.table}>
            <tbody className={threshold.tbodyDivide}>
              <tr>
                <td colSpan={5} className={threshold.emptyCell}>
                  {opportunities.length === 0
                    ? "No opportunities match the current filters."
                    : "No unread opportunities. Enable “Show read” to review completed items."}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
};
