import {
  deploymentPipelineSDCPN,
  sirModel,
  probabilisticSatellitesSDCPN,
  supplyChainWithDisruption,
  productionMachines,
  supplyChainProfit,
} from "@hashintel/petrinaut-core/examples";

import type { SDCPN } from "@hashintel/petrinaut";

export type ExampleTile = {
  /** URL-safe identifier, used in the `/processes/draft?example=<slug>` query. */
  slug: string;
  title: string;
  petriNetDefinition: SDCPN;
};

/**
 * Curated set of example nets surfaced on the `/processes` list page so the
 * grid is never empty. The slug doubles as the `?example=` query parameter
 * the editor reads when seeding a fresh draft.
 */
export const exampleTiles: ExampleTile[] = [
  { slug: "sir-model", ...sirModel },
  { slug: "production-machines", ...productionMachines },
  { slug: "deployment-pipeline", ...deploymentPipelineSDCPN },
  {
    slug: "probabilistic-satellites",
    ...probabilisticSatellitesSDCPN,
  },
  {
    slug: "supply-chain-with-disruption",
    ...supplyChainWithDisruption,
  },
  {
    slug: "supply-chain-profit",
    ...supplyChainProfit,
  },
];

export const exampleTileBySlug = new Map<string, ExampleTile>(
  exampleTiles.map((example) => [example.slug, example]),
);
