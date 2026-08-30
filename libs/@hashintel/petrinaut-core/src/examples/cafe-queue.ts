import { GRID_SIZE } from "../grid-size";

import type { SDCPN } from "../types/sdcpn";

/**
 * Café Queue — a stochastic service system: customers arrive, wait for a free
 * member of staff, get served, and leave.
 *
 * Arrive is a source transition that adds customers to Waiting at
 * `arrival_rate`; BeginService pairs one Waiting customer with one FreeStaff
 * member (moving the pair into Serving) at `begin_rate`; FinishService moves a
 * Serving customer to Served and returns the staff member to FreeStaff at
 * `service_rate`. FreeStaff + Serving is conserved (the staff pool), so the
 * tension between `arrival_rate` and the two service rates decides whether the
 * Waiting queue drains or grows — sweeping the service parameters against the
 * arrival rate is the point of the model.
 *
 * GPU-ready as shipped: every place is uncoloured (so no capacities are
 * needed), no code touches strings, and there are no expression metrics — the
 * place token counts are the observables.
 *
 * Bounded for the default rates: at `arrival_rate` 1.2 and `begin_rate` 0.4,
 * Waiting drifts up at ≈0.8 customers/s from 12, reaching ≈108 at t = 120;
 * Served accumulates at the ≤0.4/s service throughput to ≈48; FreeStaff and
 * Serving never exceed the staff pool of 3. Every count therefore stays well
 * below 200 for maxTime up to 120 at dt 0.1.
 */
export const cafeQueue: { title: string; petriNetDefinition: SDCPN } = {
  title: "Café Queue",
  petriNetDefinition: {
    places: [
      {
        id: "place__waiting",
        name: "Waiting",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        showAsInitialState: true,
        x: -20 * GRID_SIZE,
        y: 8 * GRID_SIZE,
      },
      {
        id: "place__free_staff",
        name: "FreeStaff",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        showAsInitialState: true,
        x: -12 * GRID_SIZE,
        y: 20 * GRID_SIZE,
      },
      {
        id: "place__serving",
        name: "Serving",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 4 * GRID_SIZE,
        y: 8 * GRID_SIZE,
      },
      {
        id: "place__served",
        name: "Served",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 26 * GRID_SIZE,
        y: 8 * GRID_SIZE,
      },
    ],
    transitions: [
      {
        id: "transition__arrive",
        name: "Arrive",
        inputArcs: [],
        outputArcs: [
          {
            placeId: "place__waiting",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `// Customers walk in at the configured arrival rate. The transition has no
// input arcs, so it is a source: it is always enabled and feeds Waiting.
export default Lambda((tokens, parameters) => parameters.arrival_rate)`,
        transitionKernelCode: `// Add one customer to the queue. Places are untyped, so tokens carry no
// attributes.
export default TransitionKernel(() => {
  return {
    Waiting: [{}],
  };
});`,
        x: -28 * GRID_SIZE,
        y: 8 * GRID_SIZE,
      },
      {
        id: "transition__begin_service",
        name: "BeginService",
        inputArcs: [
          {
            placeId: "place__waiting",
            weight: 1,
            type: "standard",
          },
          {
            placeId: "place__free_staff",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "place__serving",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `// Service begins at the configured rate whenever a Waiting customer and a
// FreeStaff member are both present (the two standard input arcs).
export default Lambda((tokens, parameters) => parameters.begin_rate)`,
        transitionKernelCode: `// Consumes 1 Waiting + 1 FreeStaff and produces 1 Serving: the customer and
// the staff member are now occupied together at the counter.
export default TransitionKernel(() => {
  return {
    Serving: [{}],
  };
});`,
        x: -6 * GRID_SIZE,
        y: 14 * GRID_SIZE,
      },
      {
        id: "transition__finish_service",
        name: "FinishService",
        inputArcs: [
          {
            placeId: "place__serving",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "place__served",
            weight: 1,
          },
          {
            placeId: "place__free_staff",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `// Each service in progress completes at the configured service rate.
export default Lambda((tokens, parameters) => parameters.service_rate)`,
        transitionKernelCode: `// The customer leaves with their coffee (Served) and the staff member
// returns to the pool (FreeStaff), keeping FreeStaff + Serving constant.
export default TransitionKernel(() => {
  return {
    Served: [{}],
    FreeStaff: [{}],
  };
});`,
        x: 14 * GRID_SIZE,
        y: 14 * GRID_SIZE,
      },
    ],
    types: [],
    differentialEquations: [],
    parameters: [
      {
        id: "param__arrival_rate",
        name: "Arrival Rate",
        variableName: "arrival_rate",
        type: "real",
        defaultValue: "1.2",
      },
      {
        id: "param__begin_rate",
        name: "Begin Service Rate",
        variableName: "begin_rate",
        type: "real",
        defaultValue: "0.4",
      },
      {
        id: "param__service_rate",
        name: "Service Rate",
        variableName: "service_rate",
        type: "real",
        defaultValue: "0.5",
      },
    ],
    scenarios: [
      {
        id: "scenario__morning_rush",
        name: "Morning Rush",
        description:
          "A backlog of 12 customers hits 3 staff at the default rates. Sweep arrival_rate against service_rate to find where the queue stops growing.",
        scenarioParameters: [
          { type: "real", identifier: "arrival_rate", default: 1.2 },
          { type: "real", identifier: "service_rate", default: 0.5 },
        ],
        parameterOverrides: {
          param__arrival_rate: "scenario.arrival_rate",
          param__service_rate: "scenario.service_rate",
        },
        initialState: {
          type: "per_place",
          content: {
            place__waiting: "12",
            place__free_staff: "3",
            place__serving: "0",
            place__served: "0",
          },
        },
      },
    ],
  },
};
