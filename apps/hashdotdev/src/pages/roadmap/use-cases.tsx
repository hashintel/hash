import type { ReactNode } from "react";

import { BinaryLightIcon } from "../../components/icons/binary-light-icon";
import { BrainLightIcon } from "../../components/icons/brain-light-icon";
import { BrowserLightIcon } from "../../components/icons/browser-light-icon";
import { DisplayChartUpLightIcon } from "../../components/icons/display-chart-up-light-icon";
import { GlobeIcon } from "../../components/icons/globe-icon";
import { PeopleLightIcon } from "../../components/icons/people-light-icon";
import { ScrewdriverWrenchLightIcon } from "../../components/icons/screwdriver-wrench-light-icon";
import { SitemapLightIcon } from "../../components/icons/sitemap-light-icon";

export type UseCaseId =
  | "general"
  | "knowledge-management"
  | "data-management"
  | "business-intelligence"
  | "website-building"
  | "internal-tools-apps"
  | "agent-based-simulation"
  | "entity-storage-retrieval";

type UseCase = {
  id: UseCaseId;
  name: ReactNode;
  icon: ReactNode;
};

export const useCases: UseCase[] = [
  {
    id: "general",
    name: "General",
    icon: <GlobeIcon />,
  },
  {
    id: "knowledge-management",
    name: "Knowledge Management",
    icon: <SitemapLightIcon />,
  },
  {
    id: "data-management",
    name: "Data Management",
    icon: <BinaryLightIcon />,
  },
  {
    id: "business-intelligence",
    name: "Business Intelligence",
    icon: <DisplayChartUpLightIcon />,
  },
  {
    id: "website-building",
    name: "Website Building",
    icon: <BrowserLightIcon />,
  },
  {
    id: "internal-tools-apps",
    name: "Internal Tools/Apps",
    icon: <ScrewdriverWrenchLightIcon />,
  },
  {
    id: "agent-based-simulation",
    name: "Agent-Based Simulation",
    icon: <PeopleLightIcon />,
  },
  {
    id: "entity-storage-retrieval",
    name: (
      <>
        Entity Storage/
        <wbr />
        Retrieval
      </>
    ),
    icon: <BrainLightIcon />,
  },
];
