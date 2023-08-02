import { ReactNode } from "react";

import { FaIcon } from "../../components/icons/fa-icon";
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
    icon: <FaIcon name="server" type="regular" />,
  },
  {
    id: "feature",
    name: "Feature",
    icon: <FaIcon name="sparkles" type="regular" />,
  },
  {
    id: "experiment",
    name: "Experiment",
    icon: <FaIcon name="vial" type="regular" />,
  },
];
