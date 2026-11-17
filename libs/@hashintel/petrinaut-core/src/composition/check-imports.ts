/**
 * The check on a document's imports: each one resolved. An import that is
 * still resolving is not reported.
 */

import type { SDCPN } from "../types/sdcpn";
import type { ImportStates } from "./imports";

/** An import that did not resolve. */
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
 * One problem per import that failed, or that the host does not know, saying
 * how many instances use it. An import an instance names without the document
 * listing it counts as one that did not resolve.
 */
export const checkImports = (
  sdcpn: SDCPN,
  states: ImportStates,
): ImportProblem[] => {
  const uses = new Map<string, number>(
    (sdcpn.imports ?? []).map(({ id }) => [id, 0]),
  );
  for (const net of [sdcpn, ...(sdcpn.subnets ?? [])]) {
    for (const { component } of net.componentInstances ?? []) {
      if (component) {
        uses.set(component.from, (uses.get(component.from) ?? 0) + 1);
      }
    }
  }
  return [...uses].flatMap(([importId, count]) => {
    const state = states.get(importId);
    if (state?.status === "resolving" || state?.status === "resolved") {
      return [];
    }
    return [
      {
        kind: "import" as const,
        subnetId: null,
        importId,
        severity: "error" as const,
        message: `The import \`${importId}\`, which ${describeUses(count)}, did not resolve. ${state?.message ?? "Nothing resolved it."}`,
      },
    ];
  });
};
