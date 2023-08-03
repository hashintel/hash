import { ReactNode } from "react";

import { FaIcon } from "../../components/icons/fa-icon";
import { customColors } from "../../theme/palette";

export type StatusId = "done" | "in-progress" | "next-up" | "future";

export type Status = {
  id: StatusId;
  name: string;
  icon: ReactNode;
  color: string;
};

export const statuses: Status[] = [
  {
    id: "done",
    name: "Done",
    icon: <FaIcon name="circle-check" type="regular" />,
    color: customColors.teal[90],
  },
  {
    id: "in-progress",
    name: "In Progress",
    icon: <FaIcon name="circle-half-stroke" type="regular" />,
    color: customColors.teal[70],
  },
  {
    id: "next-up",
    name: "Next Up",
    icon: <FaIcon name="circle-arrow-right" type="regular" />,
    color: customColors.teal[60],
  },
  {
    id: "future",
    name: "Future",
    icon: <FaIcon name="radar" type="regular" />,
    color: customColors.gray[50],
  },
];
