/**
 * Every problem with a document's composition, told apart by `kind`: its
 * imports, its fusions, its ports and its interfaces.
 */

import { checkFusions, type FusionProblem } from "./check-fusions";
import { checkImports, type ImportProblem } from "./check-imports";
import { checkInterfaces, type InterfaceProblem } from "./check-interfaces";
import { checkPorts, type PortProblem } from "./check-ports";
import { resolvedLibraries, type ImportStates } from "./imports";

import type { SDCPN } from "../types/sdcpn";

export type CompositionProblem =
  | ImportProblem
  | FusionProblem
  | PortProblem
  | InterfaceProblem;

const noImports: ImportStates = new Map();

/**
 * `imports` is the state of the document's imports, as an instance holds it.
 * An import that failed is one problem, and nothing else is said about the
 * instances of its components, nor about those of an import that is still
 * resolving.
 */
export const checkComposition = (
  sdcpn: SDCPN,
  imports: ImportStates = noImports,
): CompositionProblem[] => {
  const libraries = resolvedLibraries(imports);
  return [
    ...checkImports(sdcpn, imports),
    ...checkFusions(sdcpn, libraries),
    ...checkPorts(sdcpn),
    ...checkInterfaces(sdcpn, libraries),
  ];
};
