import {
  bicycleAssembly,
  cafeQueue,
  deploymentPipelineSDCPN,
  dronePatrol,
  planetsAndSatellites,
  probabilisticSatellitesSDCPN,
  productionMachines,
  satellitesWithAttraction,
  sirMassActionModel,
  sirModel,
  supplyChainWithDisruption,
  supplyChainProfit,
  vaccinationCampaign,
  wheelTruing,
} from "@hashintel/petrinaut-core/examples";

import type { SDCPN } from "@hashintel/petrinaut-core";

/**
 * The nets under "Load example", in menu order. A label is the menu's own
 * text and may differ from the title the net opens with.
 */
export const exampleNets: {
  id: string;
  label: string;
  net: { title: string; petriNetDefinition: SDCPN };
}[] = [
  { id: "sir-model", label: "SIR Model", net: sirModel },
  {
    id: "sir-mass-action",
    label: "SIR Mass-Action Model",
    net: sirMassActionModel,
  },
  { id: "cafe-queue", label: "Café Queue", net: cafeQueue },
  { id: "drone-patrol", label: "Drone Patrol", net: dronePatrol },
  {
    id: "deployment-pipeline",
    label: "Deployment Pipeline",
    net: deploymentPipelineSDCPN,
  },
  {
    id: "production-machines",
    label: "Production with Machine Failure",
    net: productionMachines,
  },
  {
    id: "supply-chain-stochastic",
    label: "Supply Chain with Disruption",
    net: supplyChainWithDisruption,
  },
  {
    id: "probabilistic-satellites",
    label: "Probabilistic Satellite Launcher",
    net: probabilisticSatellitesSDCPN,
  },
  {
    id: "satellites-attraction",
    label: "Satellites with Attraction",
    net: satellitesWithAttraction,
  },
  {
    id: "planets-and-satellites",
    label: "Planets and Satellites",
    net: planetsAndSatellites,
  },
  {
    id: "supply-chain-profit",
    label: "Supply Chain Profit",
    net: supplyChainProfit,
  },
  {
    id: "vaccination-campaign",
    label: "Vaccination Campaign",
    net: vaccinationCampaign,
  },
  { id: "bicycle-assembly", label: "Bicycle Assembly", net: bicycleAssembly },
  { id: "wheel-truing", label: "Wheel Truing", net: wheelTruing },
];
