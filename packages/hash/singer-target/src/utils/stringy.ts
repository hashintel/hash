import { inspect } from "util";

/** Stringify for dev console log printing */
export function stringy(object: any): string {
  return inspect(object, {
    colors: true,
    compact: true,
    showHidden: true,
    depth: 5,
    maxArrayLength: 3,
  });
}
