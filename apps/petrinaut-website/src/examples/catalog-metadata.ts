/**
 * Static example metadata shared by the browser catalog and server endpoints.
 *
 * Keep this module free of Petrinaut runtime imports and model loaders: Vercel
 * functions that only need to validate a public URL should not bundle every
 * example model and generated simulation artifact.
 */
export const exampleSlugs = [
  "gases-1-pn-consumption-trigger",
  "gases-1-pn",
  "gases-2-spn",
  "gases-3-cpn",
  "gases-4-dcpn",
  "semiconductor-fab-drift",
  "truck-fleet-predictive-maintenance",
] as const;

export type ExampleSlug = (typeof exampleSlugs)[number];

export type ExampleSimulationParameterBounds = Readonly<{
  min: number;
  max: number;
  step: number;
}>;

export type ExampleCatalogEntry = Readonly<{
  slug: ExampleSlug;
  title: string;
  /** Safe UI ranges for scenario parameters, keyed by identifier. */
  parameterBounds: Readonly<Record<string, ExampleSimulationParameterBounds>>;
}>;

const catalog = [
  {
    slug: "gases-1-pn-consumption-trigger",
    title: "Gases 1 — Consumption Trigger",
    parameterBounds: {
      draw_enabled: { min: 0, max: 1, step: 1 },
    },
  },
  {
    slug: "gases-1-pn",
    title: "Gases 1 — One Customer",
    parameterBounds: {
      draw_enabled: { min: 0, max: 1, step: 1 },
    },
  },
  {
    slug: "gases-2-spn",
    title: "Gases 2 — Shared Tanker",
    parameterBounds: {
      draw_enabled: { min: 0, max: 1, step: 1 },
      route_scale: { min: 0.5, max: 2, step: 0.1 },
    },
  },
  {
    slug: "gases-3-cpn",
    title: "Gases 3 — Mixed Fleet",
    parameterBounds: {
      route_scale: { min: 0.5, max: 2, step: 0.1 },
    },
  },
  {
    slug: "gases-4-dcpn",
    title: "Gases 4 — Dynamic Coloured Net",
    parameterBounds: {
      hire_enabled: { min: 0, max: 1, step: 1 },
      route_scale: { min: 0.5, max: 2, step: 0.1 },
      slow_draw: { min: 0, max: 0.1, step: 0.005 },
    },
  },
  {
    slug: "semiconductor-fab-drift",
    title: "Semiconductor Fab Drift",
    parameterBounds: {
      demand_rate: { min: 0.02, max: 0.3, step: 0.01 },
      maintenance_threshold: { min: 0.4, max: 0.99, step: 0.01 },
      wip_cap: { min: 10, max: 100, step: 5 },
    },
  },
  {
    slug: "truck-fleet-predictive-maintenance",
    title: "Truck Fleet Predictive Maintenance",
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

export const isExampleSlug = (value: string): value is ExampleSlug =>
  exampleSlugs.some((slug) => slug === value);

export const getExampleCatalogEntry = (
  slug: string,
): ExampleCatalogEntry | null =>
  catalog.find((entry) => entry.slug === slug) ?? null;
