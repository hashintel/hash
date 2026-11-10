import { serializeDocument } from "./document-text";
import { findUnknownKeys } from "./key-tree";
import { removeVisualInformation } from "./remove-visual-info";
import { version1Keys } from "./serialize-sdcpn/version-1-keys";

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
 * Whether `document` uses a key that file format version 1 does not define.
 * A reader of version 1 drops such a key without reporting it.
 */
const usesKeysBeyondVersion1 = (document: Record<string, unknown>): boolean =>
  findUnknownKeys(version1Keys, document).length > 0;

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

  const document = pickInOrder(
    {
      ...sdcpnToExport,
      version: 1,
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

  return serializeDocument(
    usesKeysBeyondVersion1(document) ? { ...document, version: 2 } : document,
    format,
  );
}
