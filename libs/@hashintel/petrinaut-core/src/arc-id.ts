/**
 * Arc identity helpers. Arcs are not first-class entities in SDCPN — they
 * live inside transitions as `inputArcs` / `outputArcs`. The editor still
 * needs stable IDs for selection, hover, and ReactFlow keys, so we synthesise
 * them by combining the source and target IDs:
 *
 *     "$A_<inputId>___<outputId>"
 *
 * Pure SDCPN ID conventions — no React, no DOM. Lives in `/core` so any
 * layer can read or generate arc IDs.
 */

export const ARC_ID_PREFIX = "$A_";
export type ArcIdPrefix = typeof ARC_ID_PREFIX;

export const ARC_ID_SEPARATOR = "___";

export function generateArcId({
  inputId,
  outputId,
}: {
  inputId: string;
  outputId: string;
}): `${ArcIdPrefix}${string}` {
  return `${ARC_ID_PREFIX}${inputId}${ARC_ID_SEPARATOR}${outputId}`;
}
