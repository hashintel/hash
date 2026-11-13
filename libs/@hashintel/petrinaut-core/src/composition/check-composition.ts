/**
 * Every problem with a document's composition, told apart by `kind`: its
 * fusions, its ports and its interfaces.
 */

import {
  checkFusions,
  checkPorts,
  type FusionProblem,
  type PortProblem,
} from "./check-fusions";
import { checkInterfaces, type InterfaceProblem } from "./check-interfaces";

import type { SDCPN } from "../types/sdcpn";

export type CompositionProblem = FusionProblem | PortProblem | InterfaceProblem;

export const checkComposition = (sdcpn: SDCPN): CompositionProblem[] => [
  ...checkFusions(sdcpn),
  ...checkPorts(sdcpn),
  ...checkInterfaces(sdcpn),
];
