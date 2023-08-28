import { ReactNode } from "react";

import { ServerRegularIcon } from "../../components/icons/server-regular-icon";
import { SparklesRegularIcon } from "../../components/icons/sparkles-regular-icon";
import { VialRegularIcon } from "../../components/icons/vial-regular-icon";
import { BlockProtocolIcon } from "./block-protocol-icon";

export type VariantId = "infrastructure" | "feature" | "experiment";

export type Variant = {
  id: VariantId;
  name: string;
  icon: ReactNode;
};

export const variants: Variant[] = [
  {
    id: "infrastructure",
    name: "Infrastructure",
    icon: <ServerRegularIcon />,
  },
  {
    id: "feature",
    name: "User Features",
    icon: <SparklesRegularIcon />,
  },
  {
    id: "experiment",
    name: "Developer Facing",
    icon: <VialRegularIcon />,
  },
];
