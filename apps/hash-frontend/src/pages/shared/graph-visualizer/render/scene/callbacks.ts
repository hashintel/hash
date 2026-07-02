import type { Position } from "../../geometry";
/**
 * The Scene's outward-facing contract: the hover/selection/label payloads it
 * reports and the callback set the host React component provides. Everything
 * here is in container-pixel space, ready to position HTML overlays.
 */
import type { EntityId, VersionedUrl } from "@blockprotocol/type-system";

/** A hovered flat-tier entity: its id and the cursor position in container pixels. */
export interface EntityHover extends Position {
  readonly entityId: EntityId;
}

/** A hovered aggregated highway: a summary of the links it bundles, at the cursor. */
export interface HighwayHover extends Position {
  /** The lane's single link type used to look up its icon; null for a rollup lane. */
  readonly typeId: VersionedUrl | null;
  readonly typeLabel: string;
  readonly count: number;
  readonly direction: "forward" | "reverse" | "both";
}

/**
 * A hovered wholly-frontier cluster bubble (every member fetched-but-unexpanded): its frontier
 * EntityIds plus the bubble's on-screen geometry, re-emitted as the camera moves / layout settles
 * so an action card can sit at its edge and offer to load it. Null on leave.
 */
export interface ClusterHover extends Position {
  readonly count: number;
  readonly frontierEntityIds: readonly EntityId[];

  /** Bubble on-screen radius (px), so the card can sit just outside its edge. */
  readonly radiusPx: number;
}

/**
 * The selected entity: its id and its on-screen position in container pixels, re-emitted as
 * the node settles and the camera moves so a pinned card can follow it.
 */
export interface EntitySelection extends Position {
  readonly entityId: EntityId;
}

/**
 * An always-on entity label to overlay as HTML: the entity, its display name, and its current
 * on-screen position (container pixels). Re-emitted each frame so labels track camera motion
 * and layout settling; intended for HTML overlay (viewport-culled), not GPU text.
 */
export interface EntityLabel extends Position {
  readonly entityId: EntityId;
  readonly text: string;
}

export interface SceneCallbacks {
  /** Report the hovered flat-tier entity, or null on leave. */
  readonly onEntityHover?: (hover: EntityHover | null) => void;
  /** Report a hovered aggregated highway's summary, or null on leave. */
  readonly onHighwayHover?: (hover: HighwayHover | null) => void;
  /** Report the selected entity + its tracked on-screen position, or null when cleared. */
  readonly onEntitySelect?: (selection: EntitySelection | null) => void;
  /** Open a table of the link entities aggregated by a clicked highway (hierarchical tier). */
  readonly onOpenLinkTable?: (linkEntityIds: readonly EntityId[]) => void;
  /** Report a hovered wholly-frontier cluster bubble (offer to load its entities), or null on leave. */
  readonly onClusterHover?: (hover: ClusterHover | null) => void;
  /**
   * Resolve an entity's display label for always-on graph labels. Called only while the label
   * eligibility set is (re)built (on zoom or structure change), never per frame.
   */
  readonly resolveEntityLabel?: (entityId: EntityId) => string | undefined;
  /**
   * Resolve an entity's type icon to an atlas key (emoji or image URL), or null when none exists.
   * Called only while the icon cache is (re)built on structure change, never per frame.
   */
  readonly resolveEntityIcon?: (entityId: EntityId) => string | null;
  /**
   * Report the always-on entity (hub) labels to overlay as HTML, re-emitted each frame with their
   * current on-screen positions (so they track the camera / settle). Empty when none are visible.
   */
  readonly onEntityLabels?: (labels: readonly EntityLabel[]) => void;
  /** Fired once when the first structure frame lands, signalling that the graph is ready to display. */
  readonly onFirstStructure: () => void;
}
