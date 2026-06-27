import { useState, useMemo } from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

import { CATEGORIES, isDwellType } from "../../shared/categories";
import { useCostParams, computePeriodCost } from "../../shared/cost";
import { CategoryIcon } from "./shared/category-icon";
import { StepCard } from "./shared/step-card";

import type { GraphData, GraphNode, StepType } from "../../shared/types";

const board = css({
  display: "flex",
  gap: "0",
  minH: "[500px]",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "lg",
  overflow: "hidden",
  bg: "bgSolid.min",
});
const column = css({
  flex: "1",
  minW: "0",
  borderRightWidth: "1px",
  borderRightStyle: "solid",
  borderColor: "bd.subtle",
  _last: { borderRightWidth: "0" },
});
const colHeader = css({
  px: "4",
  py: "3",
  borderBottomWidth: "1px",
  borderColor: "bd.subtle",
});
const colHeaderRow = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
});
const colHeaderTitle = css({ display: "flex", alignItems: "center", gap: "2" });
const colLabel = css({
  textStyle: "sm",
  fontWeight: "medium",
  color: "fg.heading",
});
const sortGroup = css({ display: "flex", alignItems: "center", gap: "1" });
const colBody = css({
  p: "3",
  display: "flex",
  flexDirection: "column",
  gap: "3",
});
const emptyNote = css({
  textStyle: "xs",
  color: "fg.subtle",
  fontStyle: "italic",
  px: "1",
});
const sortBtnBase = css({
  display: "flex",
  alignItems: "center",
  gap: "0.5",
  textStyle: "xxs",
  fontWeight: "medium",
  px: "1.5",
  py: "0.5",
  borderRadius: "sm",
  transition: "colors",
  cursor: "pointer",
});
const sortBtnActive = css({ color: "fg.heading", bg: "bg.subtle" });
const sortBtnInactive = css({
  color: "fg.subtle",
  _hover: { color: "fg.muted", bg: "bg.subtle" },
});
const sortArrow = css({ flexShrink: 0 });

interface CategoryViewProps {
  graph: GraphData;
  onStepClick: (stepId: string) => void;
  timeRange?: string;
}

type SortKey = "default" | "duration" | "cost";
type SortDir = "asc" | "desc";

function computeNodeCost(
  node: GraphNode,
  waccRate: number,
  storageCost: number,
): number {
  return computePeriodCost(
    node.monthly,
    node.cost?.unit_price,
    waccRate,
    storageCost,
  );
}

const SortButton = ({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir?: SortDir;
  onClick: () => void;
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(sortBtnBase, active ? sortBtnActive : sortBtnInactive)}
    >
      {label}
      {active && dir && (
        <svg
          width="8"
          height="8"
          viewBox="0 0 8 8"
          fill="none"
          className={sortArrow}
          aria-hidden="true"
        >
          {dir === "desc" ? (
            <path
              d="M1.5 3L4 5.5L6.5 3"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          ) : (
            <path
              d="M1.5 5.5L4 3L6.5 5.5"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          )}
        </svg>
      )}
    </button>
  );
};
export const CategoryView = ({
  graph,
  onStepClick,
  timeRange,
}: CategoryViewProps) => {
  const { waccRate, storageCost } = useCostParams();
  const [sortOverrides, setSortOverrides] = useState<
    Record<string, { key: SortKey; dir: SortDir } | null>
  >({});
  const grouped = useMemo(() => {
    return CATEGORIES.filter((column2) => !column2.hidden).map((cat) => ({
      ...cat,
      nodes: graph.nodes.filter((count) => cat.types.includes(count.type)),
    }));
  }, [graph.nodes]);
  const effectiveSortKeys = useMemo(() => {
    const keys: Record<string, { key: SortKey; dir: SortDir }> = {};
    for (const cat of grouped) {
      keys[cat.key] = { key: "duration", dir: "desc" };
    }
    for (const [key, value] of Object.entries(sortOverrides)) {
      if (value === null) {
        delete keys[key];
      } else {
        keys[key] = value;
      }
    }
    return keys;
  }, [grouped, sortOverrides]);
  const sortedGrouped = useMemo(() => {
    return grouped.map((cat) => {
      const sort = effectiveSortKeys[cat.key];
      if (!sort || sort.key === "default") {
        return cat;
      }
      const sorted = [...cat.nodes].sort((left, right) => {
        let va = 0;
        let vb = 0;
        if (sort.key === "duration") {
          va = left.stats.median ?? 0;
          vb = right.stats.median ?? 0;
        } else if (sort.key === "cost") {
          va = computeNodeCost(left, waccRate, storageCost);
          vb = computeNodeCost(right, waccRate, storageCost);
        }
        return sort.dir === "desc" ? vb - va : va - vb;
      });
      return { ...cat, nodes: sorted };
    });
  }, [grouped, effectiveSortKeys, waccRate, storageCost]);
  const toggleSort = (catKey: string, key: SortKey) => {
    setSortOverrides((prev) => {
      const cur = effectiveSortKeys[catKey];
      if (cur?.key === key) {
        if (cur.dir === "desc") {
          return { ...prev, [catKey]: { key, dir: "asc" } };
        }
        return { ...prev, [catKey]: null };
      }
      return { ...prev, [catKey]: { key, dir: "desc" } };
    });
  };
  const hasDwellType = (types: string[]) =>
    types.some((threshold) => isDwellType(threshold as StepType));
  return (
    <div className={board}>
      {sortedGrouped.map((cat) => {
        const sort = effectiveSortKeys[cat.key];
        return (
          <div key={cat.key} className={column}>
            <div className={colHeader}>
              <div className={colHeaderRow}>
                <div className={colHeaderTitle}>
                  <CategoryIcon icon={cat.icon} size={14} color={cat.color} />
                  <span className={colLabel}>{cat.label}</span>
                </div>
                {cat.nodes.length > 1 && (
                  <div className={sortGroup}>
                    <SortButton
                      label="Duration"
                      active={sort?.key === "duration"}
                      dir={sort?.key === "duration" ? sort.dir : undefined}
                      onClick={() => toggleSort(cat.key, "duration")}
                    />

                    {hasDwellType(cat.types) && (
                      <SortButton
                        label="Cost"
                        active={sort?.key === "cost"}
                        dir={sort?.key === "cost" ? sort.dir : undefined}
                        onClick={() => toggleSort(cat.key, "cost")}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className={colBody}>
              {cat.nodes.map((node) => (
                <StepCard
                  key={node.id}
                  node={node}
                  onClick={() => onStepClick(node.id)}
                  timeRange={timeRange}
                />
              ))}
              {cat.nodes.length === 0 && <p className={emptyNote}>No steps</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
};
