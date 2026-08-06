import { useMemo, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { SearchableSelect } from "../../shared/searchable-select";
import { PipelineWaterfall } from "./shared/pipeline-waterfall";

import type {
  OrderLineRow,
  PipelineStage,
  PipelineSummary,
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
const orderSelect = css({
  maxW: "[24rem]",
});
const hint = css({ textStyle: "xs", color: "fg.subtle" });

interface OrderLookupProps {
  orderLines: OrderLineRow[];
}

const daysBetween = (later: string, earlier: string): number =>
  Math.max(
    Math.round((Date.parse(later) - Date.parse(earlier)) / 86_400_000),
    0,
  );

const buildOrderPipeline = (
  orderLines: OrderLineRow[],
): Record<string, PipelineSummary> => {
  const orderCreated = orderLines
    .map((orderLine) => orderLine.order_created)
    .sort()[0];
  const goodsIssue = orderLines
    .map((orderLine) => orderLine.dispatch_date)
    .sort()
    .at(-1);
  if (!orderCreated || !goodsIssue) {
    return {};
  }
  const deliveryCreated = orderLines
    .map((orderLine) => orderLine.delivery_created)
    .filter((date): date is string => date != null)
    .sort()[0];
  const stages: PipelineStage[] = [];
  if (deliveryCreated) {
    stages.push({
      id: "seg_order_to_delivery",
      label: "Order Created → Delivery Created",
      type: "order_wait",
      mean: daysBetween(deliveryCreated, orderCreated),
      median: daysBetween(deliveryCreated, orderCreated),
      pct_of_total: 0,
      n: orderLines.length,
    });
  }
  const fulfilmentStart = deliveryCreated ?? orderCreated;
  stages.push({
    id: "seg_delivery_to_dispatch",
    label: deliveryCreated
      ? "Delivery Created → Goods Issue"
      : "Order Created → Goods Issue",
    type: "fulfilment",
    mean: daysBetween(goodsIssue, fulfilmentStart),
    median: daysBetween(goodsIssue, fulfilmentStart),
    pct_of_total: 0,
    n: orderLines.length,
  });
  const total = stages.reduce((sum, stage) => sum + stage.mean, 0);
  for (const stage of stages) {
    stage.pct_of_total = total > 0 ? (stage.mean / total) * 100 : 0;
  }
  return {
    orders: {
      label: "Customer order",
      stages,
      total_mean: total,
      total_median: total,
    },
  };
};

export const OrderLookup = ({ orderLines }: OrderLookupProps) => {
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const orderLinesByOrder = useMemo(() => {
    const linesByOrder = new Map<string, OrderLineRow[]>();
    for (const orderLine of orderLines) {
      const lines = linesByOrder.get(orderLine.sales_order) ?? [];
      lines.push(orderLine);
      linesByOrder.set(orderLine.sales_order, lines);
    }
    return linesByOrder;
  }, [orderLines]);
  const orderGroups = useMemo(
    () => [
      {
        label: "Orders",
        options: [...orderLinesByOrder.entries()]
          .map(([order, lines]) => {
            const customers = [
              ...new Set(
                lines
                  .map((orderLine) => orderLine.customer)
                  .filter((customer): customer is string => Boolean(customer)),
              ),
            ];
            const orderDate = lines
              .map((orderLine) => orderLine.order_created)
              .sort()[0];
            const details = [...customers, orderDate]
              .filter(Boolean)
              .join(" · ");
            return {
              value: order,
              label: details ? `${order} (${details})` : order,
            };
          })
          .sort((left, right) => left.value.localeCompare(right.value)),
      },
    ],
    [orderLinesByOrder],
  );
  const selectedLines = useMemo(
    () => (selectedOrder ? (orderLinesByOrder.get(selectedOrder) ?? []) : []),
    [orderLinesByOrder, selectedOrder],
  );
  const selectedPipeline = useMemo(
    () => buildOrderPipeline(selectedLines),
    [selectedLines],
  );
  const selectedOrderDate = selectedLines
    .map((orderLine) => orderLine.order_created)
    .sort()[0];
  const selectedDispatchDate = selectedLines
    .map((orderLine) => orderLine.dispatch_date)
    .sort()
    .at(-1);
  const selectedMetadata = [
    selectedOrderDate ? `Order date: ${selectedOrderDate}` : "",
    selectedDispatchDate ? `Dispatch date: ${selectedDispatchDate}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={wrap}>
      <div className={inputRow}>
        <SearchableSelect
          className={orderSelect}
          groups={orderGroups}
          value={selectedOrder ?? ""}
          onChange={setSelectedOrder}
          placeholder="Select an order…"
          clearable={{
            clearable: selectedOrder != null,
            onClear: () => setSelectedOrder(null),
          }}
          ariaLabel="Order"
        />
        {selectedLines.length > 0 && (
          <span className={hint}>{selectedMetadata}</span>
        )}
      </div>

      {selectedLines.length > 0 && (
        <PipelineWaterfall
          summaries={selectedPipeline}
          activeRoute="orders"
          totalOnly
        />
      )}
    </div>
  );
};
