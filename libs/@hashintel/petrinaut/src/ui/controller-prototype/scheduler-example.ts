import { CONSTRAINTS_METADATA_KEY } from "../../react/controller-prototype/constraints";
import { CONTROLLERS_METADATA_KEY } from "../../react/controller-prototype/controllers";

import type { ModelConstraint } from "../../react/controller-prototype/constraints";
import type { Controller } from "../../react/controller-prototype/controllers";
import type { SDCPN } from "@hashintel/petrinaut-core";

/** Two controllers on Supply Chain With Disruption: Scheduler for the factory floor, Purchasing for supply. */
export const demoControllers: Controller[] = [
  {
    id: "controller__scheduler",
    name: "Scheduler",
    constraintIds: ["backorders_under_20", "machine_health_above_0_2"],
    goal: { direction: "maximise", metricId: "metric_service_level" },
    levers: [
      {
        id: "lever__start_production_rate",
        kind: "rate",
        transitionId: "trans_start_production",
      },
      {
        id: "lever__preventive_maintenance_rate",
        kind: "rate",
        transitionId: "trans_preventive_maintenance",
      },
      {
        id: "lever__start_production_fields",
        kind: "tokenField",
        transitionId: "trans_start_production",
        places: [
          {
            placeId: "place_wip",
            elementIds: ["batch_processing_left", "batch_source_mix"],
          },
        ],
      },
    ],
  },
  {
    id: "controller__purchasing",
    name: "Purchasing",
    levers: [
      {
        id: "lever__supplier_a_rate",
        kind: "rate",
        transitionId: "trans_order_supplier_a",
      },
      {
        id: "lever__raw_materials",
        kind: "initialTokens",
        placeId: "place_raw_materials",
      },
    ],
  },
];

/** Seven constraints on Supply Chain With Disruption, two of them picked by Scheduler. */
export const demoConstraints: ModelConstraint[] = [
  {
    id: "machines_back_within_2_days",
    name: "Machines come back within 2 days",
    time: "always",
    trigger: {
      subject: { kind: "placeTokens", id: "place_machine_down" },
      op: "above",
      bound: 0,
    },
    checks: [
      {
        kind: "rule",
        time: "eventually",
        window: { kind: "within", to: 2 },
        checks: [
          {
            subject: { kind: "placeTokens", id: "place_machine_up" },
            op: "above",
            bound: 0,
          },
        ],
      },
    ],
    preset: "response",
    tolerance: 95,
    mode: "monitored",
  },
  {
    id: "backorders_until_supplier_b",
    name: "Backorders hold until supplier B is back",
    time: "until",
    checks: [
      {
        subject: { kind: "placeTokens", id: "place_backorders" },
        op: "below",
        bound: 20,
      },
    ],
    second: [
      {
        subject: { kind: "placeTokens", id: "place_supplier_b_available" },
        op: "above",
        bound: 0,
      },
    ],
    tolerance: 95,
    mode: "monitored",
  },
  {
    id: "backorders_under_20",
    name: "Backorders stay under 20",
    time: "always",
    window: { kind: "between", from: 30, to: 360 },
    checks: [
      {
        subject: { kind: "placeTokens", id: "place_backorders" },
        op: "below",
        bound: 20,
      },
    ],
    tolerance: 95,
    mode: "monitored",
  },
  {
    id: "machine_health_above_0_2",
    name: "Machine health above 0.2",
    time: "always",
    checks: [
      {
        subject: {
          kind: "tokenField",
          id: "place_machine_up",
          field: "machine_health",
        },
        op: "above",
        bound: 0.2,
      },
    ],
    tolerance: 99,
    mode: "monitored",
  },
  {
    id: "scrap_under_5",
    name: "Scrap under 5% of batches",
    time: "always",
    checks: [
      {
        subject: { kind: "metric", id: "metric_scrap_rate" },
        op: "below",
        bound: 0.05,
      },
    ],
    tolerance: 90,
    mode: "monitored",
  },
  {
    id: "order_wait_under_14_days",
    name: "No order waits over 14 days",
    forEvery: {
      typeId: "type_order",
      where: "in",
      placeIds: ["place_orders", "place_backorders"],
    },
    time: "always",
    checks: [
      {
        subject: { kind: "tokenField", id: "type_order", field: "order_age" },
        op: "below",
        bound: 14,
      },
    ],
    tolerance: 90,
    mode: "monitored",
  },
  {
    id: "recovery_keeps_orders_moving",
    name: "Recovery keeps orders moving",
    time: "always",
    trigger: {
      subject: { kind: "placeTokens", id: "place_machine_down" },
      op: "above",
      bound: 0,
    },
    checks: [
      {
        kind: "rule",
        time: "always",
        trigger: {
          subject: { kind: "placeTokens", id: "place_backorders" },
          op: "above",
          bound: 20,
        },
        checks: [
          {
            kind: "rule",
            time: "eventually",
            window: { kind: "within", to: 5 },
            checks: [
              {
                subject: { kind: "placeTokens", id: "place_orders" },
                op: "below",
                bound: 10,
              },
            ],
          },
        ],
      },
    ],
    tolerance: 95,
    mode: "monitored",
  },
];

export const withConstraints = (
  sdcpn: SDCPN,
  constraints: ModelConstraint[]
): SDCPN => ({
  ...sdcpn,
  metadata: {
    ...sdcpn.metadata,
    [CONSTRAINTS_METADATA_KEY]: constraints,
  },
});

export const withControllers = (
  sdcpn: SDCPN,
  controllers: Controller[]
): SDCPN => ({
  ...sdcpn,
  metadata: {
    ...sdcpn.metadata,
    [CONTROLLERS_METADATA_KEY]: controllers,
  },
});

/** Production batches drawn in a neutral grey, so no place reads as highlighted next to the levers. */
export const withNeutralBatchColor = (sdcpn: SDCPN): SDCPN => ({
  ...sdcpn,
  types: sdcpn.types.map((type) =>
    type.id === "type_batch" ? { ...type, displayColor: "#a1a1aa" } : type
  ),
});
