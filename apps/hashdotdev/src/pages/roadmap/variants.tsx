import { ReactNode } from "react";

import { ServerRegularIcon } from "../../components/icons/server-regular-icon";
import { SparklesRegularIcon } from "../../components/icons/sparkles-regular-icon";
import { VialRegularIcon } from "../../components/icons/vial-regular-icon";
import { BlockProtocolIcon } from "./block-protocol-icon";

export type VariantId =
  | "block-protocol"
  | "infrastructure"
  | "feature"
  | "experiment";

export type Variant = {
  id: VariantId;
  name: string;
  icon: ReactNode;
};

export const variants: Variant[] = [
  {
    id: "block-protocol",
    name: "Block Protocol",
    icon: <BlockProtocolIcon sx={{ fontSize: 12 }} />,
  },
  {
    id: "infrastructure",
    name: "Infrastructure",
    icon: <ServerRegularIcon />,
  },
  {
    id: "feature",
    name: "Feature",
    icon: <SparklesRegularIcon />,
  },
  {
    id: "experiment",
    name: "Experiment",
    icon: <VialRegularIcon />,
  },
];
