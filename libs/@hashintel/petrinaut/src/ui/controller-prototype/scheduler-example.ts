import { CONTROLLERS_METADATA_KEY } from "../../react/controller-prototype/controllers";

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
