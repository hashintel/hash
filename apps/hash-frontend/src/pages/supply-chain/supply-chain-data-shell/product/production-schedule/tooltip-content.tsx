import { css } from "@hashintel/ds-helpers/css";

import { batchLifecycleEnd, batchLifecycleStart } from "./model";

import type {
  ProductionScheduleBatch,
  ProductionScheduleConsumptionEvent,
  ProductionScheduleDispatchEvent,
} from "../../../shared/production-schedule-types";
import type { BatchDirectUse } from "./model";
import type { CSSProperties } from "react";

const tooltipContent = css({
  display: "grid",
  gap: "0",
  minW: "[min(280px,calc(100vw-32px))]",
  maxW: "[360px]",
  textAlign: "left",
  whiteSpace: "normal",
  overflowWrap: "anywhere",
  wordBreak: "break-word",
});
const tooltipTitle = css({
  display: "block",
  fontWeight: "semibold",
  pb: "[6px]",
});
const tooltipGroup = css({
  display: "block",
  pt: "[10px]",
  pb: "[6px]",
  borderTopWidth: "1px",
  borderTopColor: "[rgba(203,213,225,0.55)]",
  textAlign: "left",
  whiteSpace: "normal",
  overflowWrap: "anywhere",
});
const tooltipLine = css({ display: "block" });
const tooltipSectionHeading = css({
  display: "block",
});
const tooltipSectionHeadingStyle = {
  borderBottom: "1px solid rgba(203, 213, 225, 0.55)",
  fontWeight: 700,
  paddingBottom: 4,
} satisfies CSSProperties;
const tooltipDetail = css({ display: "block", mt: "[2px]" });
const tooltipDetails = css({ display: "grid", gap: "[2px]" });
const tooltipOrderGroup = css({ display: "block", mt: "[8px]" });

type LifecycleBalanceFields = {
  lifecycle_balance_status?:
    | "balanced"
    | "over_depleted"
    | "unknown_opening_balance";
  lifecycle_overage_quantity?: number;
  lifecycle_exit_quantity?: number;
  remaining_quantity?: number | null;
};

type DispatchUomFields = { uom?: string | null };

const lifecycleBalance = (batch: ProductionScheduleBatch) =>
  batch as ProductionScheduleBatch & LifecycleBalanceFields;

const formatQuantity = (value: number): string =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);

const productionOrderLabel = (order: string): string =>
  order.replace(/^0+/, "") || "0";

const materialReference = (
  material: string,
  materialNameByMaterial: ReadonlyMap<string, string>,
): string => {
  const knownName = materialNameByMaterial.get(material)?.trim();
  const name =
    knownName && knownName !== material ? knownName : "Unknown material";
  return `${name} (${material})`;
};

interface ConsumptionUseGroup {
  batchNumbers: Set<string>;
  consumptions: {
    date: string;
    eventId: string;
    quantity: number;
  }[];
  material: string;
  order: string | null;
}

const consumptionUseGroups = (
  events: readonly ProductionScheduleConsumptionEvent[],
  getTargetBatches: (eventId: string) => readonly ProductionScheduleBatch[],
  hierarchyMaterials: ReadonlySet<string>,
) => {
  const inViewGroups = new Map<string, ConsumptionUseGroup>();
  const outsideViewGroups = new Map<string, ConsumptionUseGroup>();

  for (const event of events) {
    const targetBatches = getTargetBatches(event.id);
    for (const material of event.direct_consumer_materials) {
      const groups = hierarchyMaterials.has(material)
        ? inViewGroups
        : outsideViewGroups;
      const key = `${event.consuming_order ?? ""}\u0000${material}`;
      const group = groups.get(key) ?? {
        batchNumbers: new Set<string>(),
        consumptions: [],
        material,
        order: event.consuming_order,
      };
      group.consumptions.push({
        date: event.consumption_date,
        eventId: event.id,
        quantity: event.net_quantity,
      });
      for (const targetBatch of targetBatches) {
        if (targetBatch.material === material && targetBatch.batch) {
          group.batchNumbers.add(targetBatch.batch);
        }
      }
      groups.set(key, group);
    }
  }

  const sortedGroups = (groups: Map<string, ConsumptionUseGroup>) =>
    [...groups.values()].sort(
      (left, right) =>
        (left.order ?? "").localeCompare(right.order ?? "") ||
        left.material.localeCompare(right.material),
    );

  return {
    inView: sortedGroups(inViewGroups),
    outsideView: sortedGroups(outsideViewGroups),
  };
};

const consumptionGroupsByMaterial = (groups: ConsumptionUseGroup[]) => {
  const groupsByMaterial = new Map<string, ConsumptionUseGroup[]>();
  for (const group of groups) {
    const materialGroups = groupsByMaterial.get(group.material) ?? [];
    materialGroups.push(group);
    groupsByMaterial.set(group.material, materialGroups);
  }
  return [...groupsByMaterial.entries()]
    .map(([material, orderGroups]) => ({ material, orderGroups }))
    .sort((left, right) => left.material.localeCompare(right.material));
};

const ConsumptionUseGroups = ({
  batchUom,
  events,
  getTargetBatches,
  hierarchyMaterials,
  materialNameByMaterial,
}: {
  batchUom?: string | null;
  events: readonly ProductionScheduleConsumptionEvent[];
  getTargetBatches: (eventId: string) => readonly ProductionScheduleBatch[];
  hierarchyMaterials: ReadonlySet<string>;
  materialNameByMaterial: ReadonlyMap<string, string>;
}) => {
  const { inView, outsideView } = consumptionUseGroups(
    events,
    getTargetBatches,
    hierarchyMaterials,
  );

  return (
    <>
      {[
        {
          external: false,
          groups: inView,
          heading: "Consumed by production in this view",
        },
        {
          external: true,
          groups: outsideView,
          heading: "Used by production outside this view",
        },
      ].map(({ external, groups, heading }) =>
        groups.length > 0 ? (
          <div className={tooltipGroup} aria-label={heading} key={heading}>
            <span
              className={tooltipSectionHeading}
              style={tooltipSectionHeadingStyle}
            >
              {heading}
            </span>
            <div className={tooltipDetails}>
              {consumptionGroupsByMaterial(groups).map(
                (materialGroup, materialIndex) => (
                  <div
                    key={materialGroup.material}
                    style={{
                      display: "block",
                      marginTop: materialIndex === 0 ? 8 : 16,
                    }}
                  >
                    {external && (
                      <span className={tooltipLine} style={{ fontWeight: 700 }}>
                        External material {materialIndex + 1}
                      </span>
                    )}
                    <span className={tooltipLine}>
                      {materialReference(
                        materialGroup.material,
                        materialNameByMaterial,
                      )}
                    </span>
                    {materialGroup.orderGroups.map((orderGroup) => (
                      <div
                        className={tooltipOrderGroup}
                        key={orderGroup.order ?? ""}
                      >
                        <span className={tooltipLine}>
                          Order{" "}
                          {orderGroup.order
                            ? productionOrderLabel(orderGroup.order)
                            : "not recorded"}
                        </span>
                        {orderGroup.consumptions.map((consumption) => (
                          <span
                            className={tooltipDetail}
                            key={consumption.eventId}
                          >
                            Consumed {formatQuantity(consumption.quantity)}
                            {batchUom ? ` ${batchUom}` : ""} on{" "}
                            {consumption.date}
                          </span>
                        ))}
                        {orderGroup.batchNumbers.size > 0 && (
                          <span
                            style={{
                              display: "block",
                              marginTop: 8,
                            }}
                          >
                            <span style={{ fontWeight: 700 }}>Batches</span>{" "}
                            {[...orderGroup.batchNumbers].sort().join(", ")}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ),
              )}
            </div>
          </div>
        ) : null,
      )}
    </>
  );
};

const roleLabel = (
  role: "finished_good" | "intermediate" | "raw_material",
): string =>
  ({
    finished_good: "Finished good",
    intermediate: "Intermediate",
    raw_material: "Raw material",
  })[role];

const deliverySummary = (
  delivery: ProductionScheduleDispatchEvent["deliveries"][number],
): string =>
  [
    delivery.delivery_number ? `Delivery ${delivery.delivery_number}` : null,
    delivery.customer_name ?? delivery.ship_to ?? null,
    delivery.incoterms_2
      ? `Destination ${delivery.incoterms_2}`
      : delivery.customer_city
        ? `Destination ${[delivery.customer_city, delivery.customer_country]
            .filter(Boolean)
            .join(", ")}`
        : null,
  ]
    .filter(Boolean)
    .join(" · ");

const DispatchDetails = ({
  event,
}: {
  event: ProductionScheduleDispatchEvent;
}) =>
  event.deliveries.length > 0 ? (
    <span className={tooltipDetails} aria-label="Delivery details">
      {event.deliveries.map((delivery) => (
        <span
          className={tooltipDetail}
          key={`${delivery.delivery_number}-${delivery.delivery_item}`}
        >
          {deliverySummary(delivery)}
        </span>
      ))}
    </span>
  ) : (
    <span className={tooltipDetail}>Goods-issue evidence</span>
  );

const DispatchTooltipItem = ({
  dispatch,
  fallbackUom,
}: {
  dispatch: ProductionScheduleDispatchEvent;
  fallbackUom?: string | null;
}) => (
  <>
    <span className={tooltipLine}>
      {dispatch.dispatch_date} · batch {dispatch.batch} ·{" "}
      {formatQuantity(dispatch.quantity)}{" "}
      {(dispatch as ProductionScheduleDispatchEvent & DispatchUomFields).uom ??
        fallbackUom ??
        ""}
    </span>
    <DispatchDetails event={dispatch} />
  </>
);

export const BatchTooltipContent = ({
  batch,
  directUse,
  dispatches,
  events,
  getTargetBatches,
  hierarchyMaterials,
  materialNameByMaterial,
  role,
}: {
  batch: ProductionScheduleBatch;
  directUse: BatchDirectUse | undefined;
  dispatches: ProductionScheduleDispatchEvent[];
  events: readonly ProductionScheduleConsumptionEvent[];
  getTargetBatches: (eventId: string) => readonly ProductionScheduleBatch[];
  hierarchyMaterials: ReadonlySet<string>;
  materialNameByMaterial: ReadonlyMap<string, string>;
  role: "finished_good" | "intermediate" | "raw_material";
}) => {
  const lifecycleOnly = batch.timing_kind === "lifecycle_only";
  const attributableConsumptionQuantity = directUse?.consumers.every(
    ({ quantity }) => quantity != null,
  )
    ? directUse.consumers.reduce(
        (total, consumer) => total + (consumer.quantity ?? 0),
        0,
      )
    : null;
  const dispatchedQuantity = dispatches
    .filter((dispatch) => dispatch.episode_scope === "in_episode")
    .reduce((total, dispatch) => total + dispatch.quantity, 0);

  return (
    <div className={tooltipContent}>
      <span className={tooltipTitle}>Batch {batch.batch ?? batch.order}</span>
      <div className={tooltipGroup}>
        {!lifecycleOnly && role !== "raw_material" ? (
          <span className={tooltipLine}>
            {roleLabel(role)} · Production {batch.start} – {batch.end}
          </span>
        ) : null}
        {role !== "raw_material" && batch.order ? (
          <span className={tooltipDetail}>
            Production order {productionOrderLabel(batch.order)}
          </span>
        ) : null}
        <span className={tooltipDetail}>
          Inventory lifecycle {batchLifecycleStart(batch)} –{" "}
          {batchLifecycleEnd(batch)}
          {batch.lifecycle_end_reason === "open" ? " · open residual" : ""}
        </span>
        <span className={tooltipDetail}>
          {batch.quantity == null
            ? "Output quantity unavailable"
            : `${formatQuantity(batch.quantity)} ${batch.uom ?? ""} ${
                role === "raw_material" ? "received" : "produced"
              }`}
          {batch.remaining_quantity != null
            ? ` – ${formatQuantity(batch.remaining_quantity)} ${
                batch.uom ?? ""
              } remaining`
            : ""}
        </span>
        {attributableConsumptionQuantity != null &&
          attributableConsumptionQuantity > 0 && (
            <span className={tooltipDetail}>
              {formatQuantity(attributableConsumptionQuantity)}{" "}
              {batch.uom ?? ""} used in production
            </span>
          )}
        {dispatchedQuantity > 0 && (
          <span className={tooltipDetail}>
            {formatQuantity(dispatchedQuantity)} {batch.uom ?? ""} dispatched
          </span>
        )}
      </div>
      {lifecycleBalance(batch).lifecycle_balance_status === "over_depleted" && (
        <div className={tooltipGroup}>
          Warning: recorded exits exceed available inventory by{" "}
          {formatQuantity(
            lifecycleBalance(batch).lifecycle_overage_quantity ?? 0,
          )}{" "}
          {batch.uom ?? ""}.
        </div>
      )}
      <ConsumptionUseGroups
        batchUom={batch.uom}
        events={events}
        getTargetBatches={getTargetBatches}
        hierarchyMaterials={hierarchyMaterials}
        materialNameByMaterial={materialNameByMaterial}
      />
      {role !== "finished_good" &&
        directUse?.state === "no_recorded_consumption" && (
          <div className={tooltipGroup}>No recorded direct consumption</div>
        )}
      {(directUse?.unconsumedQuantity ?? 0) > 0 && (
        <div className={tooltipGroup}>
          No recorded production consumption:{" "}
          {formatQuantity(directUse!.unconsumedQuantity)} {batch.uom ?? ""}
        </div>
      )}
      {dispatches.length > 0 && (
        <div className={tooltipGroup} aria-label="Batch dispatches">
          <span
            className={tooltipSectionHeading}
            style={tooltipSectionHeadingStyle}
          >
            {role === "finished_good" ? "Dispatches" : "Dispatched as FG"}
          </span>
          <span className={tooltipDetails}>
            {dispatches.map((dispatch) => (
              <span className={tooltipDetail} key={dispatch.id}>
                <DispatchTooltipItem
                  dispatch={dispatch}
                  fallbackUom={batch.uom}
                />
              </span>
            ))}
          </span>
        </div>
      )}
    </div>
  );
};

export const ConsumptionTooltipContent = ({
  batchUom,
  events,
  getTargetBatches,
  hierarchyMaterials,
  materialNameByMaterial,
}: {
  batchUom?: string | null;
  events: readonly ProductionScheduleConsumptionEvent[];
  getTargetBatches: (eventId: string) => readonly ProductionScheduleBatch[];
  hierarchyMaterials: ReadonlySet<string>;
  materialNameByMaterial: ReadonlyMap<string, string>;
}) => (
  <div className={tooltipContent}>
    <ConsumptionUseGroups
      batchUom={batchUom}
      events={events}
      getTargetBatches={getTargetBatches}
      hierarchyMaterials={hierarchyMaterials}
      materialNameByMaterial={materialNameByMaterial}
    />
  </div>
);

export const DispatchTooltipContent = ({
  ariaLabel,
  dispatches,
  fallbackUom,
  itemElement: ItemElement = "div",
  title,
}: {
  ariaLabel?: string;
  dispatches: readonly ProductionScheduleDispatchEvent[];
  fallbackUom?: string | null;
  itemElement?: "div" | "span";
  title: string;
}) => (
  <div className={tooltipContent}>
    <span className={tooltipTitle}>{title}</span>
    <div aria-label={ariaLabel}>
      {dispatches.map((dispatch) => (
        <ItemElement className={tooltipGroup} key={dispatch.id}>
          <DispatchTooltipItem dispatch={dispatch} fallbackUom={fallbackUom} />
        </ItemElement>
      ))}
    </div>
  </div>
);
