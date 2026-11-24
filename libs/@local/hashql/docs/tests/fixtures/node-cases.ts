import { Array } from "effect";

import * as Declarations from "./declaration-cases.js";
import * as Members from "./member-cases.js";
import * as Types from "./type-cases.js";

import type { NodeCase } from "./node-case.js";

export const cases: readonly NodeCase[] = Array.flatten([
  Declarations.cases,
  Members.cases,
  Types.cases,
]);
