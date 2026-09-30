import { CONTROLLERS_METADATA_KEY } from "../../react/controller-prototype/controllers";

import type { Controller } from "../../react/controller-prototype/controllers";
import type { SDCPN } from "@hashintel/petrinaut-core";

/** One controller, Scheduler, holding one lever of each kind on Supply Chain With Disruption. */
export const scheduler: Controller = {
  id: "controller__scheduler",
  name: "Scheduler",
  levers: [
    {
      id: "lever__machine_up",
      kind: "choice",
      placeId: "place_machine_up",
      transitionIds: ["trans_start_production", "trans_preventive_maintenance"],
    },
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
    {
      id: "lever__promised_lead_time",
      kind: "tokenField",
      transitionId: "trans_convert_to_backorder",
      placeId: "place_backorders",
      elementId: "order_promise",
    },
  ],
};

export const withControllers = (
  sdcpn: SDCPN,
  controllers: Controller[],
): SDCPN => ({
  ...sdcpn,
  metadata: {
    ...sdcpn.metadata,
    [CONTROLLERS_METADATA_KEY]: controllers,
  },
});
