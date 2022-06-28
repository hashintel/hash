import { startCase } from "lodash";
import { theme } from "@hashintel/hash-design-system";

// @todo revise the colors here
const NODE_COLORS = {
  opened: theme.palette.green[50],
  reviewed: theme.palette.mint[60],
  review_requested: theme.palette.orange[50],
  ready_for_review: theme.palette.teal[60],
  closed: theme.palette.red[60],
  merged: theme.palette.blue[50],
  mentioned: theme.palette.red[50],
} as { [k: string]: string };

export const getEventTypeColor = (eventType: string): string => {
  return NODE_COLORS[eventType] ?? theme.palette.gray[40];
};

export const getEventTypeName = (eventType: string) => {
  return startCase(eventType.replaceAll("_", " "));
};

export const getEventTypeInfo = (eventType: string) => {
  const color = NODE_COLORS[eventType] ?? theme.palette.gray[40];
  const text = startCase(eventType.replaceAll("_", " "));

  return { title: text, color };
};
