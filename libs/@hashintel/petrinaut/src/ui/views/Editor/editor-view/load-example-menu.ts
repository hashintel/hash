import {
  cafeQueue,
  deploymentPipelineSDCPN,
  dronePatrol,
  probabilisticSatellitesSDCPN,
  productionMachines,
  sirModel,
  supplyChainProfit,
  supplyChainWithDisruption,
  ticketProcessingSDCPN,
  vaccinationCampaign,
} from "@hashintel/petrinaut-core/examples";

import type { MenuItem } from "@hashintel/ds-components";
import type { SDCPN } from "@hashintel/petrinaut-core";

export type LoadableExample = {
  id: string;
  text: string;
  example: { title: string; petriNetDefinition: SDCPN };
  /** Listed only while the status views setting is on. */
  requiresStatusViews?: true;
};

const loadableExamples: readonly LoadableExample[] = [
  { id: "load-example-sir-model", text: "SIR Model", example: sirModel },
  { id: "load-example-cafe-queue", text: "Café Queue", example: cafeQueue },
  {
    id: "load-example-drone-patrol",
    text: "Drone Patrol",
    example: dronePatrol,
  },
  {
    id: "load-example-deployment-pipeline",
    text: "Deployment Pipeline",
    example: deploymentPipelineSDCPN,
  },
  {
    id: "load-example-production-machines",
    text: "Production with Machine Failure",
    example: productionMachines,
  },
  {
    id: "load-example-ticket-processing",
    text: "Ticket Processing",
    example: ticketProcessingSDCPN,
    requiresStatusViews: true,
  },
  {
    id: "load-example-supply-chain-stochastic",
    text: "Supply Chain with Disruption",
    example: supplyChainWithDisruption,
  },
  {
    id: "load-example-probabilistic-satellites",
    text: "Probabilistic Satellite Launcher",
    example: probabilisticSatellitesSDCPN,
  },
  {
    id: "load-example-supply-chain-profit",
    text: "Supply Chain Profit",
    example: supplyChainProfit,
  },
  {
    id: "load-example-vaccination-campaign",
    text: "Vaccination Campaign",
    example: vaccinationCampaign,
  },
];

/**
 * The examples the Load example menu offers. Examples built around status
 * views are listed only while that setting is on, so the menu never loads a
 * net whose main feature the editor is hiding.
 */
export const listLoadableExamples = ({
  enableStatusViews,
}: {
  enableStatusViews: boolean;
}): readonly LoadableExample[] =>
  loadableExamples.filter(
    (entry) => enableStatusViews || entry.requiresStatusViews !== true,
  );

export const loadExampleMenuItem = ({
  enableStatusViews,
  onLoadExample,
}: {
  enableStatusViews: boolean;
  onLoadExample: (example: LoadableExample["example"]) => void;
}): MenuItem => ({
  id: "load-example",
  text: "Load example",
  subItems: listLoadableExamples({ enableStatusViews }).map((entry) => ({
    id: entry.id,
    text: entry.text,
    onClick: () => onLoadExample(entry.example),
  })),
});
