import { useMemo, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { Tooltip } from "../../shared/tooltip";

import type {
  BatchRow,
  BatchTimelines,
  OrderLineRow,
} from "../../shared/types";

const wrap = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  minW: "0",
});
const inputRow = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  flexWrap: "wrap",
});
const inputLabel = css({
  textStyle: "xs",
  color: "fg.muted",
  fontWeight: "medium",
});
const inputBox = css({
  textStyle: "xs",
  color: "fg.max",
  bg: "bg.subtle",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "md",
  px: "2",
  py: "1",
  w: "[14rem]",
});
const hint = css({ textStyle: "xs", color: "fg.subtle" });
const noTrace = css({
  textStyle: "xs",
  color: "fg.subtle",
  fontStyle: "italic",
});
const stripOuter = css({
  position: "relative",
  w: "full",
  h: "[84px]",
  minW: "0",
});
const axisBar = css({
  position: "absolute",
  left: "0",
  right: "0",
  top: "[38px]",
  h: "[14px]",
  bg: "bg.subtle",
  borderRadius: "sm",
});
const segmentBox = css({
  position: "absolute",
  top: "[38px]",
  h: "[14px]",
  borderRadius: "sm",
});
const anchorTick = css({
  position: "absolute",
  top: "[34px]",
  w: "[2px]",
  h: "[22px]",
  bg: "fg.subtle",
  borderRadius: "sm",
});
const anchorLabel = css({
  position: "absolute",
  top: "[58px]",
  transform: "translateX(-50%)",
  textStyle: "xxs",
  color: "fg.subtle",
  whiteSpace: "nowrap",
});
const orderMarkerTop = css({
  position: "absolute",
  top: "[18px]",
  transform: "translateX(-50%)",
  cursor: "help",
  lineHeight: "[1]",
  textStyle: "xs",
});
const orderMarkerBottom = css({
  position: "absolute",
  top: "[52px]",
  transform: "translateX(-50%)",
  cursor: "help",
  lineHeight: "[1]",
  textStyle: "xs",
});
const axisEndLabel = css({
  position: "absolute",
  top: "0",
  textStyle: "xxs",
  color: "fg.subtle",
  whiteSpace: "nowrap",
});
const legendRow = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  flexWrap: "wrap",
});
const legendItem = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  textStyle: "xxs",
  color: "fg.subtle",
});
const legendSwatch = css({
  w: "2.5",
  h: "2.5",
  borderRadius: "sm",
  flexShrink: 0,
});

const DOWN = "\u25bc";
const UP = "\u25b2";
const ARROW = "\u2192";
const SEGMENT_COLORS = {
  procurement: "#64ade6",
  production: "#9797fe",
  qa_hold: "#c3a8e6",
  transit: "#ff9c5e",
} as const;
const MARKER_COLORS: Record<string, string> = {
  from_stock: "#3d9b6b",
  awaited_production: "#d98324",
  unknown: "#8b93a1",
};

interface BatchAnchor {
  key: string;
  label: string;
  date: string;
}

const ANCHOR_DEFS: Array<[keyof BatchRow, string]> = [
  ["earliest_po_date", "First PO"],
  ["earliest_gr_date", "Materials received"],
  ["earliest_production_start", "Production start"],
  ["fg_receipt_date", "Production finish"],
  ["qa_release_date", "QA release"],
  ["delivery_date", "Delivery"],
];

const SEGMENT_SPANS: Array<
  [string, string, keyof typeof SEGMENT_COLORS, string]
> = [
  [
    "earliest_gr_date",
    "earliest_production_start",
    "procurement",
    `Materials received ${ARROW} Production start`,
  ],
  [
    "earliest_production_start",
    "fg_receipt_date",
    "production",
    `Production start ${ARROW} finish`,
  ],
  [
    "fg_receipt_date",
    "qa_release_date",
    "qa_hold",
    `Production finish ${ARROW} QA release`,
  ],
  [
    "qa_release_date",
    "delivery_date",
    "transit",
    `QA release ${ARROW} Delivery`,
  ],
];

interface BatchLookupProps {
  batchTimelines?: BatchTimelines;
  orderLines: OrderLineRow[];
}

export const BatchLookup = ({
  batchTimelines,
  orderLines,
}: BatchLookupProps) => {
  const [query, setQuery] = useState("");
  const knownBatches = useMemo(() => {
    const ids = new Set<string>();
    for (const batch of batchTimelines?.batches ?? []) {
      ids.add(batch.batch);
    }
    for (const line of orderLines) {
      for (const batch of line.batches) {
        ids.add(batch);
      }
    }
    return [...ids].sort();
  }, [batchTimelines, orderLines]);

  const selected = query.trim().toUpperCase();
  const batchRow = useMemo(
    () =>
      (batchTimelines?.batches ?? []).find(
        (batch) => batch.batch.toUpperCase() === selected,
      ) ?? null,
    [batchTimelines, selected],
  );
  const batchOrders = useMemo(
    () =>
      orderLines.filter((line) =>
        line.batches.some((batch) => batch.toUpperCase() === selected),
      ),
    [orderLines, selected],
  );
  const hasSelection =
    selected.length > 0 && (batchRow != null || batchOrders.length > 0);

  return (
    <div className={wrap}>
      <div className={inputRow}>
        <label className={inputLabel} htmlFor="batch-lookup-input">
          Batch lookup
        </label>
        <input
          id="batch-lookup-input"
          className={inputBox}
          list="batch-lookup-options"
          placeholder="Enter a batch number\u2026"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          spellCheck={false}
        />
        <datalist id="batch-lookup-options">
          {knownBatches.map((batch) => (
            <option key={batch} value={batch}>
              {batch}
            </option>
          ))}
        </datalist>
        {selected.length > 0 && !hasSelection && (
          <span className={hint}>
            No production trace or customer order found for &quot;{selected}
            &quot;
          </span>
        )}
        {!selected && (
          <span className={hint}>
            {knownBatches.length} known batches {"\u00b7"} shows production
            timing with customer-order markers
          </span>
        )}
      </div>
      {hasSelection && (
        // The lookup is the primary exported component; keep the larger strip
        // renderer below it so this file reads from public UI to detail.
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        <BatchStrip batch={selected} row={batchRow} orders={batchOrders} />
      )}
    </div>
  );
};

const BatchStrip = ({
  batch,
  row,
  orders,
}: {
  batch: string;
  row: BatchRow | null;
  orders: OrderLineRow[];
}) => {
  const anchors: BatchAnchor[] = [];
  if (row) {
    for (const [key, label] of ANCHOR_DEFS) {
      const value = row[key];
      if (typeof value === "string" && value) {
        anchors.push({ key, label, date: value });
      }
    }
  }
  const orderDates = orders.flatMap((order) => [
    order.order_created,
    order.dispatch_date,
  ]);
  const allDates = [
    ...anchors.map((anchor) => anchor.date),
    ...orderDates,
  ].sort();
  const firstDate = allDates[0];
  const lastDate = allDates.at(-1);
  if (!firstDate || !lastDate) {
    return null;
  }
  const minimumTime = Date.parse(firstDate);
  const maximumTime = Date.parse(lastDate);
  const rawSpan = Math.max(maximumTime - minimumTime, 86_400_000);
  const padding = rawSpan * 0.04;
  const lowerBound = minimumTime - padding;
  const span = rawSpan + padding * 2;
  const percentage = (date: string) =>
    ((Date.parse(date) - lowerBound) / span) * 100;
  const anchorByKey = new Map(anchors.map((anchor) => [anchor.key, anchor]));
  const labelled: BatchAnchor[] = [];
  let lastPercentage = Number.NEGATIVE_INFINITY;
  for (const anchor of [...anchors].sort((left, right) =>
    left.date < right.date ? -1 : 1,
  )) {
    const value = percentage(anchor.date);
    if (value - lastPercentage >= 9) {
      labelled.push(anchor);
      lastPercentage = value;
    }
  }

  return (
    <div>
      <div className={stripOuter}>
        <span className={axisEndLabel} style={{ left: 0 }}>
          {firstDate}
        </span>
        <span className={axisEndLabel} style={{ right: 0 }}>
          {lastDate}
        </span>
        <div className={axisBar} />
        {SEGMENT_SPANS.map(([fromKey, toKey, type, label]) => {
          const from = anchorByKey.get(fromKey);
          const to = anchorByKey.get(toKey);
          if (!from || !to) {
            return null;
          }
          const left = percentage(from.date);
          const width = Math.max(percentage(to.date) - left, 0.3);
          const days = Math.round(
            (Date.parse(to.date) - Date.parse(from.date)) / 86_400_000,
          );
          return (
            <Tooltip
              key={`${fromKey}-${toKey}`}
              content={`${label}: ${days}d (${from.date} ${ARROW} ${to.date})`}
              delayMs={0}
              wrapperClassName={segmentBox}
              wrapperStyle={{
                left: `${left}%`,
                width: `${width}%`,
                backgroundColor: SEGMENT_COLORS[type],
              }}
            >
              <span />
            </Tooltip>
          );
        })}
        {anchors.map((anchor) => (
          <Tooltip
            key={anchor.key}
            content={`${anchor.label}: ${anchor.date}`}
            delayMs={0}
            wrapperClassName={anchorTick}
            wrapperStyle={{ left: `${percentage(anchor.date)}%` }}
          >
            <span />
          </Tooltip>
        ))}
        {labelled.map((anchor) => (
          <span
            key={`label-${anchor.key}`}
            className={anchorLabel}
            style={{ left: `${percentage(anchor.date)}%` }}
          >
            {anchor.label}
          </span>
        ))}
        {orders.map((order) => {
          const color =
            MARKER_COLORS[order.fulfilment] ?? MARKER_COLORS.unknown;
          const identifier = `SO ${order.sales_order}/${order.so_item}`;
          const customer = order.customer ? ` \u2014 ${order.customer}` : "";
          return (
            <span key={`${order.sales_order}-${order.so_item}`}>
              <Tooltip
                content={`${identifier}${customer}: created ${order.order_created} (${order.fulfilment.replaceAll("_", " ")})`}
                delayMs={0}
                wrapperClassName={orderMarkerTop}
                wrapperStyle={{
                  left: `${percentage(order.order_created)}%`,
                  color,
                }}
              >
                <span aria-hidden="true">{DOWN}</span>
              </Tooltip>
              <Tooltip
                content={`${identifier}${customer}: goods issue ${order.dispatch_date}`}
                delayMs={0}
                wrapperClassName={orderMarkerBottom}
                wrapperStyle={{
                  left: `${percentage(order.dispatch_date)}%`,
                  color,
                }}
              >
                <span aria-hidden="true">{UP}</span>
              </Tooltip>
            </span>
          );
        })}
      </div>
      <div className={legendRow}>
        {!row && (
          <span className={noTrace}>
            No production trace for batch {batch} in this dataset {"\u2014"}{" "}
            showing customer-order dates only.
          </span>
        )}
        <span className={legendItem}>
          <span style={{ color: MARKER_COLORS.from_stock }}>{DOWN}</span>
          order created (from stock)
        </span>
        <span className={legendItem}>
          <span style={{ color: MARKER_COLORS.awaited_production }}>
            {DOWN}
          </span>
          order created (awaited production)
        </span>
        <span className={legendItem}>
          <span style={{ color: MARKER_COLORS.unknown }}>{DOWN}</span>
          order created (unknown)
        </span>
        <span className={legendItem}>{UP} goods issue</span>
        {SEGMENT_SPANS.map(([fromKey, , type, label]) => (
          <span key={fromKey} className={legendItem}>
            <span
              className={legendSwatch}
              style={{ backgroundColor: SEGMENT_COLORS[type] }}
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
};
