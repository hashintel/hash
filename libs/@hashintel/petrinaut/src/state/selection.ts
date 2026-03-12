import { ARC_ID_PREFIX, ARC_ID_SEPARATOR } from "./sdcpn-context";

export type SelectionItemType =
  | "place"
  | "transition"
  | "arc"
  | "type"
  | "differentialEquation"
  | "parameter";

export type SelectionItem =
  | { type: "place"; id: string }
  | { type: "transition"; id: string }
  | { type: "arc"; id: string }
  | { type: "type"; id: string }
  | { type: "differentialEquation"; id: string }
  | { type: "parameter"; id: string };

/** Map from item ID -> typed SelectionItem. O(1) lookup for ReactFlow bridge. */
export type SelectionMap = Map<string, SelectionItem>;

export type PanelTarget =
  | { kind: "none" }
  | { kind: "single"; item: SelectionItem }
  | { kind: "multi"; items: SelectionItem[] };

export function parseArcId(
  arcId: string,
): { sourceId: string; targetId: string } | null {
  if (!arcId.startsWith(ARC_ID_PREFIX)) {
    return null;
  }
  const rest = arcId.slice(ARC_ID_PREFIX.length);
  const [sourceId, targetId] = rest.split(ARC_ID_SEPARATOR);
  if (!sourceId || !targetId) {
    return null;
  }
  return { sourceId, targetId };
}
