import type { CheckerItemDiagnostics } from "../checker/worker/protocol";

/** Generates the Monaco model path for a given SDCPN item. */
export function getEditorPath(
  itemType: CheckerItemDiagnostics["itemType"],
  itemId: string,
): string {
  switch (itemType) {
    case "transition-lambda":
      return `inmemory://sdcpn/transitions/${itemId}/lambda.ts`;
    case "transition-kernel":
      return `inmemory://sdcpn/transitions/${itemId}/kernel.ts`;
    case "differential-equation":
      return `inmemory://sdcpn/differential-equations/${itemId}.ts`;
  }
}
