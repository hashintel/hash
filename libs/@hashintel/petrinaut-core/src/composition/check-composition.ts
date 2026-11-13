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
import type { ProvidedInterfaces } from "./provided-components";

export type CompositionProblem = FusionProblem | PortProblem | InterfaceProblem;

/** `provided` are the interfaces a host provides: an instance of one needs no implementation. */
export const checkComposition = (
  sdcpn: SDCPN,
  provided?: ProvidedInterfaces,
): CompositionProblem[] => [
  ...checkFusions(sdcpn),
  ...checkPorts(sdcpn),
  ...checkInterfaces(sdcpn, provided),
];
