import { ReactNode } from "react";

import { CircleArrowRightRegularIcon } from "../../components/icons/circle-arrow-right-regular-icon";
import { CircleCheckRegularIcon } from "../../components/icons/circle-check-regular-icon";
import { CircleHalfStrokeRegularIcon } from "../../components/icons/circle-half-stroke-regular-icon";
import { RadarRegularIcon } from "../../components/icons/radar-regular-icon";
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
    icon: <CircleCheckRegularIcon />,
    color: customColors.teal[90],
  },
  {
    id: "in-progress",
    name: "In Progress",
    icon: <CircleHalfStrokeRegularIcon />,
    color: customColors.teal[70],
  },
  {
    id: "next-up",
    name: "Next Up",
    icon: <CircleArrowRightRegularIcon />,
    color: customColors.teal[60],
  },
  {
    id: "future",
    name: "Future",
    icon: <RadarRegularIcon />,
    color: customColors.gray[50],
  },
];
