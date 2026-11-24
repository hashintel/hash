import { use } from "react";

import {
  inlineImports,
  type ResolvedLibraries,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { CompositionContext } from "./composition-context";
import { SDCPNContext } from "./sdcpn-context";

const inlinedByDefinition = new WeakMap<
  SDCPN,
  { libraries: ResolvedLibraries; inlined: SDCPN }
>();

/**
 * `inlineImports`, giving the same net for the same document and libraries:
 * what reads the net starts over when it changes.
 */
const inlineOnce = (sdcpn: SDCPN, libraries: ResolvedLibraries): SDCPN => {
  const known = inlinedByDefinition.get(sdcpn);
  if (known?.libraries === libraries) {
    return known.inlined;
  }
  const inlined = inlineImports(sdcpn, libraries);
  inlinedByDefinition.set(sdcpn, { libraries, inlined });
  return inlined;
};

/**
 * The document with the components it takes from its imports inlined: the
 * net to give the simulator, the compiler and the language server, which
 * take one net and no libraries. The document itself when it imports nothing.
 */
export const useExecutableDefinition = (): SDCPN => {
  const { petriNetDefinition } = use(SDCPNContext);
  const { libraries } = use(CompositionContext);
  return inlineOnce(petriNetDefinition, libraries);
};
