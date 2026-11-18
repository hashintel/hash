/**
 * The check on a document's imports: each one resolved, and every library
 * the document names is one of them. An import that is still resolving is
 * not reported.
 */

import {
  componentOf,
  defaultImplementation,
  indexDocument,
} from "./interfaces";

import type { SDCPN } from "../types/sdcpn";
import type { ImportStates } from "./imports";

/** An import that did not resolve, or a library the document names without importing it. */
export type ImportProblem = {
  kind: "import";
  /** Always the root net: an import belongs to the document. */
  subnetId: null;
  importId: string;
  severity: "error";
  message: string;
};

const describeUses = (count: number): string => {
  if (count === 0) {
    return "no instance uses";
  }
  return count === 1 ? "1 instance uses" : `${count} instances use`;
};

/**
 * One problem per import that failed, or that the host does not know, and one
 * per library the document names without importing it, whatever a host
 * resolved that one to: another host has no reason to. Each says how many
 * instances use the library: the ones whose component comes from it, or the
 * implementation they chose, or else the document's default for them.
 */
export const checkImports = (
  sdcpn: SDCPN,
  states: ImportStates,
): ImportProblem[] => {
  const imported = new Set((sdcpn.imports ?? []).map(({ id }) => id));
  const uses = new Map<string, number>([...imported].map((id) => [id, 0]));
  const count = (from: string | undefined, instances: number): void => {
    if (from !== undefined) {
      uses.set(from, (uses.get(from) ?? 0) + instances);
    }
  };
  // A default names its libraries, whether or not an instance runs it.
  for (const { interface: iface, component } of sdcpn.implementations ?? []) {
    count(iface.from, 0);
    count(component.from, 0);
  }
  const { defaults } = indexDocument(sdcpn);
  for (const net of [sdcpn, ...(sdcpn.subnets ?? [])]) {
    for (const instance of net.componentInstances ?? []) {
      const component = componentOf(instance);
      const implementation =
        instance.implementation ??
        defaultImplementation(sdcpn, component, defaults);
      // Once for the instance, whatever it takes from the library.
      for (const from of new Set([component.from, implementation?.from])) {
        count(from, 1);
      }
    }
  }
  return [...uses].flatMap(([importId, instances]) => {
    const problem = (message: string): ImportProblem => ({
      kind: "import",
      subnetId: null,
      importId,
      severity: "error",
      message,
    });
    const which = `\`${importId}\`, which ${describeUses(instances)}`;
    if (!imported.has(importId)) {
      return [problem(`The document does not import ${which}.`)];
    }
    const state = states.get(importId);
    if (state?.status === "resolving" || state?.status === "resolved") {
      return [];
    }
    return [
      problem(
        `The import ${which}, did not resolve. ${state?.message ?? "Nothing resolved it."}`,
      ),
    ];
  });
};
