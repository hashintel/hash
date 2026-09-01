import type { SDCPN } from "@hashintel/petrinaut-core";

const TRUCK_FLEET_SLUG = "truck-fleet-predictive-maintenance";

const buildTruckFleetInitialState = (
  meanSource: "parameters" | "scenario",
): string => `const fleet = range(scenario.trucks).map((index) => ({
    brake_wear: (index / scenario.trucks) * 0.1,
    engine_wear: (index / scenario.trucks) * 0.08,
    tyre_wear: (index / scenario.trucks) * 0.12,
    km_remaining: 0,
    route_distance: 0,
    service_remaining: 0,
    route_class: 0,
    load_due: 0,
    load_revenue: 0,
    age: 0,
    loads_done: 0,
    unplanned: 0,
    road_severity: ${meanSource}.base_severity_mean,
    speed_factor: ${meanSource}.base_speed_mean,
    conditions_clock: 0,
    fuel_burned: 0,
    hours_driven: 0,
    rest_remaining: 0,
    fuel_rate: 0,
  }));
  return {
    Available: fleet,
    LoadBoard: [],
    Drivers: scenario.drivers,
    Bays: scenario.bays,
    Technicians: scenario.technicians,
    Spares: scenario.spares,
    RecoveryUnits: scenario.recovery_units,
    Conditions: [{ severity_mean: ${meanSource}.base_severity_mean, speed_mean: ${meanSource}.base_speed_mean, clock: 0 }],
    Rest: [],
    RestEvents: 0,
  };`;

/**
 * Applies the small, reviewed compatibility transformations needed by the
 * published examples. Source files stay byte-for-byte identical to the files
 * supplied for FE-1500; both the canonical route and generated embed artifacts
 * consume this normalized definition.
 */
export const normalizeExampleDefinition = (
  slug: string,
  definition: SDCPN,
): SDCPN => {
  if (slug !== TRUCK_FLEET_SLUG) {
    return definition;
  }

  return {
    ...definition,
    scenarios: definition.scenarios?.map((scenario) => {
      if (scenario.initialState.type !== "code") {
        return scenario;
      }

      const content = scenario.initialState.content;
      if (
        !content.includes("for (let index = 0;") ||
        !content.includes("...newTruck")
      ) {
        return scenario;
      }

      const meanSource = content.includes("scenario.base_severity_mean")
        ? "scenario"
        : "parameters";

      return {
        ...scenario,
        initialState: {
          type: "code",
          content: buildTruckFleetInitialState(meanSource),
        },
      };
    }),
  };
};
