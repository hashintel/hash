/**
 * The Scene's outward-facing contract: the hover/selection/label payloads it
 * reports and the callback set the host React component provides. Everything
 * here is in container-pixel space, ready to position HTML overlays.
 */
import type { EntityId, VersionedUrl } from "@blockprotocol/type-system";

/** A hovered flat-tier entity: its id and the cursor position in container pixels. */
export interface EntityHover {
  readonly entityId: EntityId;
  readonly x: number;
  readonly y: number;
}

/** A hovered aggregated highway: a summary of the links it bundles, at the cursor. */
export interface HighwayHover {
  /** The lane's single link type (for the main thread to resolve the icon); null for a rollup. */
  readonly typeId: VersionedUrl | null;
  readonly typeLabel: string;
  readonly count: number;
  readonly direction: "forward" | "reverse" | "both";
  readonly x: number;
  readonly y: number;
}

/**
 * A hovered wholly-frontier cluster bubble (every member fetched-but-unexpanded): its frontier
 * EntityIds plus the bubble's on-screen geometry, re-emitted as the camera moves / layout settles
 * so an action card can sit at its edge and offer to load it. Null on leave.
 */
export interface ClusterHover {
  readonly count: number;
  readonly frontierEntityIds: readonly EntityId[];
  /** Bubble centre in container pixels. */
  readonly x: number;
  readonly y: number;
  /** Bubble on-screen radius (px), so the card can sit just outside its edge. */
  readonly radiusPx: number;
}

/**
 * The selected entity: its id and its on-screen position in container pixels, re-emitted as
 * the node settles and the camera moves so a pinned card can follow it.
 */
export interface EntitySelection {
  readonly entityId: EntityId;
  readonly x: number;
  readonly y: number;
}

/**
 * An always-on entity label to overlay as HTML: the entity, its display name, and its CURRENT
 * on-screen position (container pixels). The Scene re-emits the visible set each frame so the
 * labels track the camera / settling layout; React renders them over the canvas (viewport-culled),
 * so they read in the hash-frontend design language rather than as GPU text.
 */
export interface EntityLabel {
  readonly entityId: EntityId;
  readonly text: string;
  readonly x: number;
  readonly y: number;
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
   * Resolve an entity's display label (its name) for the always-on graph labels. Called only
   * while the label SET is (re)built -- on a zoom / structure change -- never per frame.
   */
  readonly resolveEntityLabel?: (entityId: EntityId) => string | undefined;
  /**
   * Resolve an entity's type icon to an atlas KEY (an emoji or an image URL), or null for none
   * (a ReactElement / absent icon has no atlas entry). Called only while the icon SET is
   * (re)built -- on a structure change -- never per frame.
   */
  readonly resolveEntityIcon?: (entityId: EntityId) => string | null;
  /**
   * Report the always-on entity (hub) labels to overlay as HTML, re-emitted each frame with their
   * current on-screen positions (so they track the camera / settle). Empty when none are visible.
   */
  readonly onEntityLabels?: (labels: readonly EntityLabel[]) => void;
  /** Fired once, when the first structure frame lands (to drop the loading overlay). */
  readonly onFirstStructure: () => void;
}
