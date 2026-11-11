import type { IconName } from "@hashintel/ds-components";

import { mockEntityTypes } from "./mock-graph";

/** An output's type as the icon left of its name (2 Nov): its kind decides it. */
export const kindIcon = (kind: string | null): IconName => {
  const name = (kind ?? "").replace(/^List of /, "");
  const list = kind?.startsWith("List of ") ?? false;
  if (/entit/i.test(name) || mockEntityTypes.some((type) => type.title === name || type.pluralTitle === name)) {
    return list ? "cubes" : "cube";
  }
  if (/date|time/i.test(name)) {
    return "calendar";
  }
  if (/number|integer/i.test(name)) {
    return "oneHundred";
  }
  if (/boolean|choice|decision/i.test(name)) {
    return "list";
  }
  if (/person|user|actor/i.test(name)) {
    return "user";
  }
  if (/file/i.test(name)) {
    return "file";
  }
  return list ? "list" : "text";
};
