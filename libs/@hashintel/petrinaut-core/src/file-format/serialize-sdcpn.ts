import { serializeDocument } from "./document-text";
import { removeVisualInformation } from "./remove-visual-info";
import { SDCPN_FILE_FORMAT_VERSION } from "./types";

import type { SDCPN, Subnet } from "../types/sdcpn";
import type { DocumentFormat } from "./document-text";

type SDCPNDocumentKey = keyof SDCPN | "version" | "meta" | "title";

/**
 * Exported documents write their keys in this order: format metadata first,
 * then the net sections in dependency order — each section references only
 * sections above it by id (code strings are opaque and can mention anything).
 * Import accepts any key order; this exists for human readers and diffs.
 */
const DOCUMENT_KEY_ORDER = [
  "version",
  "meta",
  "title",
  "description",
  "metadata",
  "parameters",
  "types",
  "differentialEquations",
  "subnets",
  "places",
  "componentInstances",
  "transitions",
  "metrics",
  "scenarios",
  "statusViews",
] as const satisfies readonly SDCPNDocumentKey[];

const SUBNET_KEY_ORDER = [
  "id",
  "name",
  "description",
  "metadata",
  "parameters",
  "types",
  "differentialEquations",
  "places",
  "componentInstances",
  "transitions",
] as const satisfies readonly (keyof Subnet)[];

/** Compiles only when `T` is `never` — see the checks below. */
type AssertNever<T extends never> = T;
/**
 * These fail to compile when `SDCPN` or `Subnet` gains a field without a
 * position in the export orders above, so a new field cannot be silently
 * dropped from exports.
 */
type _EverySdcpnKeyOrdered = AssertNever<
  Exclude<SDCPNDocumentKey, (typeof DOCUMENT_KEY_ORDER)[number]>
>;
type _EverySubnetKeyOrdered = AssertNever<
  Exclude<keyof Subnet, (typeof SUBNET_KEY_ORDER)[number]>
>;

const pickInOrder = (
  value: Record<string, unknown>,
  order: readonly string[],
): Record<string, unknown> => {
  const ordered: Record<string, unknown> = {};
  for (const key of order) {
    if (Object.hasOwn(value, key)) {
      ordered[key] = value[key];
    }
  }
  return ordered;
};

/**
 * Serialize an SDCPN to the canonical file format string — YAML by default,
 * JSON on request. Both encodings carry the same structure and re-import
 * identically.
 *
 * The output includes format metadata (`version`, `meta.generator`) and the
 * editor-supplied `title`. When `removeVisualInfo` is true, places/transitions
 * lose their `x`/`y` and types lose their `displayColor`/`iconSlug` — useful
 * when sharing the structural definition without baking in a particular
 * layout / palette.
 *
 * Pure — no DOM, no I/O. Callers are responsible for delivering the result
 * (browser download, clipboard, server upload, …).
 */
export function serializeSDCPN({
  petriNetDefinition,
  title,
  removeVisualInfo,
  format = "yaml",
}: {
  petriNetDefinition: SDCPN;
  title: string;
  removeVisualInfo?: boolean;
  format?: DocumentFormat;
}): string {
  const sdcpnToExport = removeVisualInfo
    ? removeVisualInformation(petriNetDefinition)
    : petriNetDefinition;

  const payload = pickInOrder(
    {
      ...sdcpnToExport,
      version: SDCPN_FILE_FORMAT_VERSION,
      meta: {
        generator: "Petrinaut",
      },
      title,
      subnets: sdcpnToExport.subnets?.map((subnet) =>
        pickInOrder(subnet, SUBNET_KEY_ORDER),
      ),
    },
    DOCUMENT_KEY_ORDER,
  );

  return serializeDocument(payload, format);
}
