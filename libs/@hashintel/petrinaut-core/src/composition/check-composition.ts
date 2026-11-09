/**
 * Every problem with a document's composition, under one kind-tagged type:
 * its fusions, its ports and its interfaces.
 */

import {
  checkFusions,
  checkPorts,
  type FusionProblem,
  type PortProblem,
} from "./check-fusions";
import { checkInterfaces, type InterfaceProblem } from "./check-interfaces";

import type { SDCPN } from "../types/sdcpn";

export type CompositionProblem =
  | ({ kind: "fusion" } & FusionProblem)
  | ({ kind: "port" } & PortProblem)
  | ({ kind: "interface" } & InterfaceProblem);

export const checkComposition = (sdcpn: SDCPN): CompositionProblem[] => [
  ...checkFusions(sdcpn).map((problem): CompositionProblem => ({
    kind: "fusion",
    ...problem,
  })),
  ...checkPorts(sdcpn).map((problem): CompositionProblem => ({
    kind: "port",
    ...problem,
  })),
  ...checkInterfaces(sdcpn).map((problem): CompositionProblem => ({
    kind: "interface",
    ...problem,
  })),
];
