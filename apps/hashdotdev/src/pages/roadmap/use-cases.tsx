import { ReactNode } from "react";

import { FaIcon } from "../../components/icons/fa-icon";

export type UseCaseId =
  | "knowledge-management"
  | "data-management"
  | "business-intelligence"
  | "website-building"
  | "internal-tools-apps"
  | "agent-based-simulation"
  | "entity-storage-retrieval";

type UseCase = {
  id: UseCaseId;
  name: string;
  icon: ReactNode;
};

export const useCases: UseCase[] = [
  {
    id: "knowledge-management",
    name: "Knowledge Management",
    icon: <FaIcon name="sitemap" type="light" />,
  },
  {
    id: "data-management",
    name: "Data Management",
    icon: <FaIcon name="binary" type="light" />,
  },
  {
    id: "business-intelligence",
    name: "Business Intelligence",
    icon: <FaIcon name="display-chart-up" type="light" />,
  },
  {
    id: "website-building",
    name: "Website Building",
    icon: <FaIcon name="browser" type="light" />,
  },
  {
    id: "internal-tools-apps",
    name: "Internal Tools/Apps",
    icon: <FaIcon name="tools" type="light" />,
  },
  {
    id: "agent-based-simulation",
    name: "Agent-Based Simulation",
    icon: <FaIcon name="people" type="light" />,
  },
  {
    id: "entity-storage-retrieval",
    name: "Entity Storage/ Retrieval",
    icon: <FaIcon name="brain" type="light" />,
  },
];
