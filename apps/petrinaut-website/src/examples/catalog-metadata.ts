/**
 * Static example metadata shared by the browser catalog and server endpoints.
 *
 * Keep this module free of Petrinaut runtime imports and model loaders: Vercel
 * functions that only need to validate a public URL should not bundle every
 * example model and generated simulation artifact.
 */
export const PETRINAUT_DEMO_ORIGIN = "https://demo.petrinaut.org";

export const exampleSlugs = [
  "deployment-pipeline",
  "gases-1-pn-consumption-trigger",
  "gases-1-pn",
  "gases-2-spn",
  "gases-3-cpn",
  "gases-4-dcpn",
  "probabilistic-satellite-launcher",
  "production-with-machine-failure",
  "semiconductor-fab-drift",
  "sir-epidemic-model",
  "supply-chain-profit-model",
  "supply-chain-with-disruption",
  "truck-fleet-predictive-maintenance",
] as const;

export type ExampleSlug = (typeof exampleSlugs)[number];

/**
 * Where an example's definition comes from. Model files live next to this
 * module as JSON; core examples are the models Petrinaut itself ships, named
 * by their export from `@hashintel/petrinaut-core/examples`.
 */
export type ExampleSource =
  | { kind: "model-file" }
  | {
      kind: "core-example";
      exportName: keyof typeof import("@hashintel/petrinaut-core/examples");
    };

export type ExampleSimulationParameterBounds = Readonly<{
  min: number;
  max: number;
  step: number;
}>;

export type ExampleCatalogEntry = Readonly<{
  slug: ExampleSlug;
  title: string;
  source: ExampleSource;
  /** Safe UI ranges for scenario parameters, keyed by identifier. */
  parameterBounds: Readonly<Record<string, ExampleSimulationParameterBounds>>;
}>;

const modelFile = { kind: "model-file" } as const;

const coreExample = (
  exportName: Extract<ExampleSource, { kind: "core-example" }>["exportName"],
) => ({ kind: "core-example", exportName }) as const;

const catalog = [
  {
    slug: "deployment-pipeline",
    title: "Deployment Pipeline",
    source: coreExample("deploymentPipelineSDCPN"),
    parameterBounds: {
      deployment_rate: { min: 0.1, max: 2, step: 0.05 },
      failure_base_rate: { min: 0.01, max: 0.3, step: 0.01 },
      finish_rate: { min: 0.05, max: 1, step: 0.01 },
      incident_rate: { min: 0.01, max: 0.5, step: 0.01 },
      mean_size: { min: 0.25, max: 3, step: 0.05 },
      resolution_rate: { min: 0.05, max: 1, step: 0.01 },
      risk_multiplier: { min: 0.25, max: 3, step: 0.05 },
      severity_multiplier: { min: 0.5, max: 3, step: 0.05 },
    },
  },
  {
    slug: "gases-1-pn-consumption-trigger",
    title: "Gases 1 — Consumption Trigger",
    source: modelFile,
    parameterBounds: {
      draw_enabled: { min: 0, max: 1, step: 1 },
    },
  },
  {
    slug: "gases-1-pn",
    title: "Gases 1 — One Customer",
    source: modelFile,
    parameterBounds: {
      draw_enabled: { min: 0, max: 1, step: 1 },
    },
  },
  {
    slug: "gases-2-spn",
    title: "Gases 2 — Shared Tanker",
    source: modelFile,
    parameterBounds: {
      draw_enabled: { min: 0, max: 1, step: 1 },
      route_scale: { min: 0.5, max: 2, step: 0.1 },
    },
  },
  {
    slug: "gases-3-cpn",
    title: "Gases 3 — Mixed Fleet",
    source: modelFile,
    parameterBounds: {
      route_scale: { min: 0.5, max: 2, step: 0.1 },
    },
  },
  {
    slug: "gases-4-dcpn",
    title: "Gases 4 — Dynamic Coloured Net",
    source: modelFile,
    parameterBounds: {
      hire_enabled: { min: 0, max: 1, step: 1 },
      route_scale: { min: 0.5, max: 2, step: 0.1 },
      slow_draw: { min: 0, max: 0.1, step: 0.005 },
    },
  },
  {
    slug: "probabilistic-satellite-launcher",
    title: "Probabilistic Satellite Launcher",
    source: coreExample("probabilisticSatellitesSDCPN"),
    parameterBounds: {
      initial_altitude: { min: 5, max: 100, step: 1 },
      launch_rate: { min: 0.05, max: 1, step: 0.05 },
      number_of_satellites: { min: 1, max: 20, step: 1 },
      satellite_initial_altitude: { min: 5, max: 100, step: 1 },
      satellite_initial_velocity: { min: 1, max: 250, step: 1 },
    },
  },
  {
    slug: "production-with-machine-failure",
    title: "Production With Machine Failure",
    source: coreExample("productionMachines"),
    parameterBounds: {
      initial_machine_damage: { min: 0, max: 1, step: 0.05 },
      machines_count: { min: 1, max: 10, step: 1 },
      raw_material: { min: 1, max: 50, step: 1 },
    },
  },
  {
    slug: "semiconductor-fab-drift",
    title: "Semiconductor Fab Drift",
    source: modelFile,
    parameterBounds: {
      demand_rate: { min: 0.02, max: 0.3, step: 0.01 },
      maintenance_threshold: { min: 0.4, max: 0.99, step: 0.01 },
      wip_cap: { min: 10, max: 100, step: 5 },
    },
  },
  {
    slug: "sir-epidemic-model",
    title: "SIR Epidemic Model",
    source: coreExample("sirModel"),
    parameterBounds: {
      infected_ratio: { min: 0, max: 0.2, step: 0.00005 },
      population: { min: 100, max: 100000, step: 100 },
    },
  },
  {
    slug: "supply-chain-profit-model",
    title: "Supply Chain Profit Model",
    source: coreExample("supplyChainProfit"),
    parameterBounds: {
      batch_size: { min: 10, max: 1000, step: 10 },
      demand_multiplier: { min: 0.25, max: 3, step: 0.05 },
      expedite_fraction: { min: 0, max: 1, step: 0.01 },
      marketing_spend: { min: 0, max: 100, step: 1 },
      production_rate: { min: 10, max: 500, step: 5 },
      replenishment_aggressiveness: { min: 0, max: 400, step: 10 },
      selling_price: { min: 1, max: 100, step: 1 },
    },
  },
  {
    slug: "supply-chain-with-disruption",
    title: "Supply Chain With Disruption",
    source: coreExample("supplyChainWithDisruption"),
    parameterBounds: {
      a_order_multiplier: { min: 0, max: 3, step: 0.05 },
      a_recovery_rate: { min: 0.01, max: 0.5, step: 0.01 },
      a_share_bias: { min: 0, max: 1, step: 0.05 },
      b_expedite_multiplier: { min: 0.5, max: 3, step: 0.05 },
      b_order_multiplier: { min: 0, max: 3, step: 0.05 },
      b_risk_multiplier: { min: 0.5, max: 3, step: 0.05 },
      damage_threshold: { min: 0.1, max: 1, step: 0.01 },
      demand_multiplier: { min: 0.25, max: 3, step: 0.05 },
      initial_finished_goods: { min: 0, max: 50, step: 1 },
      initial_raw_materials: { min: 0, max: 50, step: 1 },
      lead_time_multiplier: { min: 0.5, max: 3, step: 0.05 },
      maintenance_multiplier: { min: 0.5, max: 4, step: 0.05 },
      supplier_recovery_multiplier: { min: 0.5, max: 4, step: 0.05 },
    },
  },
  {
    slug: "truck-fleet-predictive-maintenance",
    title: "Truck Fleet Predictive Maintenance",
    source: modelFile,
    parameterBounds: {
      base_severity_mean: { min: 0.5, max: 2, step: 0.05 },
      base_speed_mean: { min: 0.5, max: 1.5, step: 0.05 },
      bays: { min: 1, max: 4, step: 1 },
      drivers: { min: 1, max: 16, step: 1 },
      motorway_rate: { min: 0.01, max: 0.3, step: 0.005 },
      mountain_rate: { min: 0.01, max: 0.3, step: 0.005 },
      parts_lead_time: { min: 12, max: 168, step: 12 },
      recovery_units: { min: 0, max: 4, step: 1 },
      service_wear_limit: { min: 0.1, max: 10, step: 0.05 },
      severe_route_wear_limit: { min: 0.1, max: 1, step: 0.05 },
      spares: { min: 0, max: 30, step: 1 },
      technicians: { min: 1, max: 8, step: 1 },
      trucks: { min: 1, max: 20, step: 1 },
      urban_rate: { min: 0.01, max: 0.3, step: 0.005 },
    },
  },
] as const satisfies readonly ExampleCatalogEntry[];

export const exampleCatalog: readonly ExampleCatalogEntry[] = catalog;

/** The slugs whose definition is a JSON model file next to this module. */
export type ModelFileExampleSlug = Extract<
  (typeof catalog)[number],
  { source: { kind: "model-file" } }
>["slug"];

export const isExampleSlug = (value: string): value is ExampleSlug =>
  exampleSlugs.some((slug) => slug === value);

export const getExampleCatalogEntry = (
  slug: string,
): ExampleCatalogEntry | null =>
  catalog.find((entry) => entry.slug === slug) ?? null;
