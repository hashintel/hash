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

const TRANSITION_LAMBDA_RE =
  /^inmemory:\/\/sdcpn\/transitions\/([^/]+)\/lambda\.ts$/;
const TRANSITION_KERNEL_RE =
  /^inmemory:\/\/sdcpn\/transitions\/([^/]+)\/kernel\.ts$/;
const DIFFERENTIAL_EQUATION_RE =
  /^inmemory:\/\/sdcpn\/differential-equations\/([^/]+)\.ts$/;

/** Extract `(itemType, itemId)` from a Monaco model URI string. */
export function parseEditorPath(uri: string): {
  itemType: CheckerItemDiagnostics["itemType"];
  itemId: string;
} | null {
  let match = TRANSITION_LAMBDA_RE.exec(uri);
  if (match) {
    return { itemType: "transition-lambda", itemId: match[1]! };
  }

  match = TRANSITION_KERNEL_RE.exec(uri);
  if (match) {
    return { itemType: "transition-kernel", itemId: match[1]! };
  }

  match = DIFFERENTIAL_EQUATION_RE.exec(uri);
  if (match) {
    return { itemType: "differential-equation", itemId: match[1]! };
  }

  return null;
}
