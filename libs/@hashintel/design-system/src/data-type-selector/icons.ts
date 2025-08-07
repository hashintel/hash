import type { StringConstraints } from "@blockprotocol/type-system";
import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";

import { fa100 } from "../fa-icons/fa-100";
import { faAtRegular } from "../fa-icons/fa-at-regular";
import { faBracketsCurly } from "../fa-icons/fa-brackets-curly";
import { faCalendarClockRegular } from "../fa-icons/fa-calendar-clock-regular";
import { faCalendarRegular } from "../fa-icons/fa-calendar-regular";
import { faClockRegular } from "../fa-icons/fa-clock-regular";
import { faEmptySet } from "../fa-icons/fa-empty-set";
import { faInputPipeRegular } from "../fa-icons/fa-input-pipe-regular";
import { faRulerRegular } from "../fa-icons/fa-ruler-regular";
import { faSquareCheck } from "../fa-icons/fa-square-check";
import { faText } from "../fa-icons/fa-text";

export const identifierTypeTitles = ["URL", "URI"];

export const measurementTypeTitles = [
  "Length",
  "Imperial Length (UK)",
  "Imperial Length (US)",
  "Metric Length (SI)",
  "Inches",
  "Feet",
  "Yards",
  "Miles",
  "Nanometers",
  "Millimeters",
  "Centimeters",
  "Meters",
  "Kilometers",
];

export const getIconForDataType = ({
  title,
  format,
  type,
}: {
  title: string;
  format?: StringConstraints["format"];
  type: string;
}): IconDefinition["icon"] => {
  if (type === "boolean") {
    return faSquareCheck;
  }
  if (type === "number") {
    if (measurementTypeTitles.includes(title)) {
      return faRulerRegular;
    }
    return fa100;
  }
  if (type === "object") {
    return faBracketsCurly;
  }
  if (type === "null") {
    return faEmptySet;
  }
  if (type === "string") {
    if (format) {
      switch (format) {
        case "uri":
          return faInputPipeRegular;
        case "email":
          return faAtRegular;
        case "date":
          return faCalendarRegular;
        case "time":
          return faClockRegular;
        case "date-time":
          return faCalendarClockRegular;
      }
    }
    if (title === "Email") {
      return faAtRegular;
    }
    if (identifierTypeTitles.includes(title)) {
      return faInputPipeRegular;
    }
    return faText;
  }

  throw new Error(`Unhandled type: ${type}`);
};
