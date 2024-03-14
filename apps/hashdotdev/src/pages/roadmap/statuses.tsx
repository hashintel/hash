import type { ReactNode } from "react";

import { CircleArrowRightSolidIcon } from "../../components/icons/circle-arrow-right-solid-icon";
import { CircleCheckSolidIcon } from "../../components/icons/circle-check-solid-icon";
import { CircleHalfStrokeRegularIcon } from "../../components/icons/circle-half-stroke-regular-icon";
import { CircleThreeQuartersStrokeSolidIcon } from "../../components/icons/circle-three-quarters-stroke-solid-icon";
import { RadarRegularIcon } from "../../components/icons/radar-regular-icon";
import { customColors } from "../../theme/palette";

export type StatusId =
  | "done"
  | "working-poc"
  | "in-progress"
  | "next-up"
  | "future";

export type Status = {
  backgroundColor: string;
  bodyColor: string;
  filterColor: string;
  id: StatusId;
  name: string;
  headingColor: string;
  icon: ReactNode;
  infoIconColor: string;
  statusColor: string;
  typeColor: string;
};

export const statuses: Status[] = [
  {
    id: "done",
    backgroundColor: customColors.teal[10],
    bodyColor: customColors.black,
    filterColor: customColors.teal[90],
    name: "Done",
    headingColor: customColors.teal[90],
    icon: <CircleCheckSolidIcon />,
    infoIconColor: customColors.teal[50],
    statusColor: customColors.teal[90],
    typeColor: customColors.teal[90],
  },
  {
    id: "working-poc",
    backgroundColor: customColors.teal[80],
    bodyColor: customColors.white,
    filterColor: customColors.teal[80],
    name: "Working POC",
    headingColor: customColors.white,
    icon: <CircleThreeQuartersStrokeSolidIcon />,
    infoIconColor: customColors.teal[50],
    statusColor: customColors.white,
    typeColor: customColors.teal[30],
  },
  {
    id: "in-progress",
    backgroundColor: customColors.teal[100],
    bodyColor: customColors.white,
    filterColor: customColors.teal[70],
    name: "In Progress",
    headingColor: customColors.white,
    icon: <CircleHalfStrokeRegularIcon />,
    infoIconColor: customColors.gray[60],
    statusColor: customColors.white,
    typeColor: customColors.teal[50],
  },
  {
    id: "next-up",
    backgroundColor: customColors.white,
    bodyColor: customColors.black,
    filterColor: customColors.teal[60],
    name: "Next Up",
    headingColor: customColors.gray[90],
    icon: <CircleArrowRightSolidIcon />,
    infoIconColor: customColors.gray[40],
    statusColor: customColors.teal[60],
    typeColor: customColors.teal[90],
  },
  {
    id: "future",
    backgroundColor: customColors.white,
    bodyColor: customColors.black,
    filterColor: customColors.gray[50],
    name: "Future",
    headingColor: customColors.gray[90],
    icon: <RadarRegularIcon />,
    infoIconColor: customColors.gray[40],
    statusColor: customColors.gray[50],
    typeColor: customColors.teal[90],
  },
];
