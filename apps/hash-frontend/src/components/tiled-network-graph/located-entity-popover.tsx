/**
 * The selection popover for the Atlas network graph: a compact white entity card
 * anchored to the selected node/edge, showing the located item's title, its
 * type chip, its simple-value properties (nodes), and a "Go to entity" action.
 * When the located detail is truncated (its type or property set capped) the
 * card flags the missing parts with a "+ more" cue. Used by the
 * entities-visualizer network graph view.
 *
 * Purely presentational — the consumer decodes a {@link fetchLocate} response
 * into {@link LocatedEntityDetail} and owns the
 * {@link LocatedEntityPopoverProps.onGoTo} behaviour; this file only lays the
 * card out (reusing the {@link Button} primitive) and positions it via
 * {@link Popover}. Every text run is clamped so a long label or value can't
 * stretch or overflow the card.
 *
 * The {@link Popover} portals its content, so a consumer that scopes the ds Panda
 * tokens to a subtree (rather than globally) must supply a `PortalContainerContext`
 * inside that scope, or the card's token-based colours won't resolve.
 */

import { Button, Icon, Popover } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

/**
 * Sits this popover — and the graph's search widget, which layers around it —
 * below app overlays that open over the graph (notably the entity drawer).
 * Passed as the `Popover`'s `positionerClassName` so it lands on the positioner,
 * whose z-index reads the `--z-index-popover` token; overriding that variable
 * here lowers only this popover's layer, not the ds default. Kept in step with
 * the search widget's base (`network-graph-search.tsx`).
 */
const lowLayerStyles = css({ "--z-index-popover": "50" });

/** The selection's live on-screen anchor, as `NetworkGraph` reports it. */
export type LocatedEntityPopoverAnchor =
  | {
      type: "node";
      x: number;
      y: number;
      nodeRadius: number;
      variant: "detailed" | "compact";
    }
  | { type: "edge"; x: number; y: number };

/**
 * One coloured run of a styled property value — the shape the entity drawer's
 * property table emits for a value (a plain `{ text, color }`, matching its
 * formatted-value parts), so the card can render the same coloured runs.
 */
export interface LocatedEntityValuePart {
  readonly text: string;
  readonly color: string;
}

/**
 * One property row of the card: a shortened key and its value — either a plain
 * string, or the styled coloured runs the property table renders.
 */
export interface LocatedEntityProperty {
  readonly key: string;
  readonly value: string | readonly LocatedEntityValuePart[];
}

/**
 * A type chip: a label, the type's icon (shown at the chip's left), and the
 * colour of its dot (shown at the chip's right).
 */
export interface LocatedEntityTypeChip {
  readonly label: string;
  readonly color: string;
  /** The type's icon — emoji or ds glyph — drawn at the chip's left. */
  readonly icon?: LocatedEntityIcon;
}

/**
 * A type icon the card renders: an emoji glyph drawn as text, or an SVG type
 * icon (given by URL) drawn as a tintable mask — the served `/icons/types/*.svg`
 * icons the rest of the app shows, which text surfaces can't draw directly. At
 * most one is set; `emoji` wins when both are.
 */
export interface LocatedEntityIcon {
  readonly emoji?: string;
  readonly svgUrl?: string;
}

/**
 * One endpoint entity of a link, shown in the edge card's from→to row: the
 * entity's label and its type icon.
 */
export interface LocatedEntityEndpoint {
  readonly label: string;
  readonly icon?: LocatedEntityIcon;
  /**
   * Selects this endpoint's node when its label is clicked — makes the label a
   * link-style button. Omitted when the endpoint can't be resolved to a
   * selectable node (the label then renders as plain text).
   */
  readonly onClick?: () => void;
}

interface LocatedEntityDetailShared {
  /** Bold card title — the entity/edge label. */
  readonly title: string;
  /** Property rows shown in the card's property table. */
  readonly properties: readonly LocatedEntityProperty[];
  /**
   * Whether the `types` list is the entity's whole set. When `false` a cue is
   * shown beside the chips that some types aren't displayed.
   */
  readonly typesComplete: boolean;
  /**
   * Whether {@link properties} is the entity's whole set. When `false` a note is
   * shown at the foot of the property table that some properties aren't displayed.
   */
  readonly propertiesComplete: boolean;
}

/** A located node: its types float beside the title as chips. */
export interface LocatedNodeDetail extends LocatedEntityDetailShared {
  readonly kind: "node";
  /**
   * The node's types, shown as chips floating beside the title — every type we
   * have for the entity, whether or not it carries a distinct colour (uncoloured
   * types render with a grey dot).
   */
  readonly types: readonly LocatedEntityTypeChip[];
  /** The node's edge/neighbour count, shown as a subtle caption under the header. */
  readonly connectionCount: number;
  /** Whether the ego-graph is whole; `false` suffixes the count with a "+". */
  readonly connectionsComplete: boolean;
}

/**
 * A located edge (a link entity): its link types float beside the title as
 * chips, and its two endpoints are shown as a from→to row above the properties.
 */
export interface LocatedEdgeDetail extends LocatedEntityDetailShared {
  readonly kind: "edge";
  /** The link's types, shown as chips floating beside the title. */
  readonly types: readonly LocatedEntityTypeChip[];
  /** The entities the link connects, in link direction. */
  readonly endpoints: {
    readonly from: LocatedEntityEndpoint;
    readonly to: LocatedEntityEndpoint;
  };
}

/** The presentational detail the card renders for a located node or edge. */
export type LocatedEntityDetail = LocatedNodeDetail | LocatedEdgeDetail;

export interface LocatedEntityPopoverProps {
  /** The element the popover is positioned within (the chart frame). */
  readonly triggerRef: React.Ref<Element>;
  /** The selected item's on-screen anchor; the popover tracks it on zoom/pan. */
  readonly anchor: LocatedEntityPopoverAnchor;
  readonly detail: LocatedEntityDetail;
  /** Dismiss (Escape or a click outside). */
  readonly onClose: () => void;
  /** "Go to entity" handler; the button is omitted when absent. */
  readonly onGoTo?: () => void;
  /**
   * Called when the card is focused or clicked, so a consumer can bring it to
   * the front over other overlays (e.g. the network graph's search widget).
   */
  readonly onActivate?: () => void;
}

const cardStyles = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  // Size to the content, floored at the former fixed width and capped at twice
  // it, so a sparse card stays compact while a dense one can grow.
  width: "[fit-content]",
  minWidth: "[200px]",
  maxWidth: "[400px]",
  padding: "3",
  backgroundColor: "white",
  borderRadius: "md",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "neutral.s40",
  boxShadow: "md",
});

// The title and type chip share one wrapping flex row so the chip "floats"
// beside a short label and drops onto its own line under a long one — flex-wrap
// packs by content width, so a short title keeps the chip alongside it while a
// long (clamped) title claims the full row and pushes the chip below.
const headerStyles = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  columnGap: "2",
  rowGap: "1",
});

const titleStyles = css({
  fontSize: "base",
  fontWeight: "[700]",
  color: "neutral.s120",
  lineHeight: "tight",
  lineClamp: "2",
});

// A compact type lozenge: a subtle grey pill holding the type's icon, its label,
// and a dot in the type's colour. The tight, even spacing keeps the icon, text,
// and dot reading as one balanced unit. The left padding flexes on whether an
// icon leads: a glyph fills the left edge, so it can sit tighter, whereas a bare
// label needs a touch more so it isn't cramped against the pill.
const typeChipRecipe = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    gap: "1.5",
    minWidth: "0",
    height: "[18px]",
    paddingRight: "1.5",
    borderRadius: "sm",
    backgroundColor: "neutral.s30",
  },
  variants: {
    hasIcon: {
      true: { paddingLeft: "1" },
      false: { paddingLeft: "2" },
    },
  },
});

// The type's icon at the chip's left — an emoji glyph or a ds Icon. Matches the
// label's tone so a monochrome glyph reads as cohesive with the text (emojis
// keep their own colour).
const chipIconStyles = css({
  display: "inline-flex",
  alignItems: "center",
  flexShrink: "0",
  fontSize: "xs",
  lineHeight: "none",
  color: "neutral.s110",
  transform: "[translateY(-0.25px)]",
});

/** Truncates a long type label in the chip, at readable contrast. */
const chipLabelStyles = css({
  truncate: true,
  maxWidth: "[160px]",
  fontSize: "xs",
  fontWeight: "medium",
  lineHeight: "none",
  color: "neutral.s110",
});

// A little extra space before the dot (beyond the chip's base gap) sets the
// colour indicator apart from the label. Nudged up a touch too: geometric
// centring reads slightly low against the label's optical centre (the caps sit
// above the box middle).
const typeDotStyles = css({
  width: "[6px]",
  height: "[6px]",
  borderRadius: "full",
  flexShrink: "0",
  marginLeft: "0.5",
});

// A muted cue sitting after the type chips when the type list is truncated —
// signals the entity holds types beyond those shown, without dressing as a chip.
const moreTypesStyles = css({
  display: "inline-flex",
  alignItems: "center",
  fontSize: "xs",
  fontWeight: "medium",
  fontStyle: "italic",
  lineHeight: "none",
  color: "neutral.s90",
});

// The node's connection count, on its own line under the header as a tiny grey
// caption. The negative top margin claws back most of the card's 8px inter-child
// gap, leaving ~2px so the caption tucks under the header as part of that block
// rather than reading as a separate section. Anchoring it to the header's bottom
// (not the title) keeps that ~2px constant however tall the header grows — so
// when the title wraps and the type chips drop onto their own taller row, the
// caption still sits snug beneath the chips rather than drifting away.
const connectionCountStyles = css({
  marginTop: "[-2px]",
  fontSize: "[11px]",
  lineHeight: "none",
  color: "neutral.s90",
});

/** "3 connections" / "1 connection", with a "+" when the ego-graph is capped. */
const formatConnectionCount = (count: number, complete: boolean): string =>
  `${count}${complete ? "" : "+"} ${
    count === 1 && complete ? "connection" : "connections"
  }`;

// The "connects" section beneath the header: the two entities the link joins,
// drawn as a directed source→target rail. Each endpoint sits on its own
// full-width row so a long label truncates identically on both (no lopsided
// wrap), and a vertical rail down the left gutter — a dot at the source, a caret
// at the target — reads top-to-bottom as the link's direction.
const connectionSectionStyles = css({
  display: "flex",
  flexDirection: "column",
  gap: "1.5",
  paddingTop: "2",
  borderTopWidth: "1px",
  borderTopStyle: "solid",
  borderTopColor: "neutral.s40",
});

// The two endpoint rows, stacked with no gap so the gutters' rail segments meet
// edge-to-edge and form one continuous line between the dot and the caret.
const connectionRowsStyles = css({
  display: "flex",
  flexDirection: "column",
});

// One endpoint row: a fixed rail gutter, then the entity (icon + label) in a
// track that shrinks to zero so the label truncates.
const endpointRowStyles = css({
  display: "grid",
  gridTemplateColumns: "[16px minmax(0, 1fr)]",
  columnGap: "2",
  alignItems: "stretch",
});

// The rail gutter: a fixed-width column stacking (spacer · marker · line) so the
// marker centres on the row while its line segment fills to the row edge, where
// it meets the neighbouring row's segment. Its min height sets the row height —
// so the rail reads tall enough between its markers regardless of label length.
const gutterStyles = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  minHeight: "[26px]",
});

// A rail line segment — a thin vertical line, centred in the gutter, growing to
// fill the space between a marker and the row edge.
const railLineStyles = css({
  flexGrow: "[1]",
  width: "[1.5px]",
  backgroundColor: "neutral.s60",
});

// Balances a marker against its line segment so the marker centres in the row.
const gutterSpacerStyles = css({
  flexGrow: "[1]",
});

// The source marker: a small filled dot the rail leaves from.
const sourceDotStyles = css({
  flexShrink: "0",
  width: "[7px]",
  height: "[7px]",
  borderRadius: "full",
  backgroundColor: "neutral.s90",
});

// The target marker: a small downward triangle the rail points into (the link's
// direction). A CSS border-triangle — not a ds icon — so the glyph has no
// internal padding: it sits flush with the line above and centres on the same
// axis as the line and the source dot. Its borders are set inline (below) since
// the triangle's arbitrary border widths don't map cleanly to Panda utilities.
const targetCaretStyles = css({
  flexShrink: "0",
});

const endpointStyles = css({
  display: "flex",
  minWidth: "0",
  alignItems: "center",
  gap: "1",
});

const endpointIconStyles = css({
  flexShrink: "0",
  fontSize: "sm",
  color: "neutral.s100",
});

const endpointLabelStyles = css({
  minWidth: "0",
  color: "neutral.s110",
  fontSize: "sm",
  truncate: true,
});

// The endpoint label as a link-style button when its node is selectable: a bare
// text button (no chrome) that shifts to the brand tone on hover/focus. On
// hover/focus its label underlines and a trailing arrow affordance fades in, so
// it reads as selecting/focusing that node in the graph.
const endpointButtonStyles = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  minWidth: "0",
  maxWidth: "full",
  appearance: "none",
  background: "[transparent]",
  border: "none",
  padding: "0",
  cursor: "pointer",
  color: "neutral.s110",
  fontFamily: "[inherit]",
  fontWeight: "[inherit]",
  fontSize: "sm",
  textAlign: "left",
  _hover: { color: "blue.s90" },
  _focusVisible: { color: "blue.s90", outline: "none" },
  "&:hover [data-endpoint-affordance], &:focus-visible [data-endpoint-affordance]":
    { opacity: "1" },
});

// The truncating label text inside the endpoint button.
const endpointButtonLabelStyles = css({
  minWidth: "0",
  truncate: true,
});

// The trailing "focus this node" affordance: hidden until the button is
// hovered/focused (revealed by `endpointButtonStyles`), tinted the brand tone.
const endpointAffordanceStyles = css({
  display: "inline-flex",
  flexShrink: "0",
  alignItems: "center",
  color: "blue.s90",
  opacity: "0",
});

const propertyListStyles = css({
  display: "flex",
  flexDirection: "column",
  // Extra breathing room from the header/endpoints above and the button below.
  marginY: "1.5",
});

const propertyRowStyles = css({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: "3",
  paddingY: "1.5",
  borderTopWidth: "1px",
  borderTopStyle: "solid",
  borderTopColor: "neutral.s40",
  // Drop the first row's divider so the table has no outer top (or bottom)
  // border, keeping only the dividers between rows.
  "&:first-child": {
    borderTopWidth: "0",
  },
});

const propertyKeyStyles = css({
  minWidth: "0",
  flex: "[1 1 auto]",
  color: "neutral.s100",
  fontSize: "sm",
  overflowWrap: "anywhere",
  lineClamp: "2",
});

const propertyValueStyles = css({
  minWidth: "0",
  flex: "[1 1 50%]",
  color: "neutral.s120",
  fontSize: "sm",
  fontWeight: "semibold",
  textAlign: "right",
  overflowWrap: "anywhere",
  lineClamp: "2",
});

// A muted note drawn as the property table's final row when the property set is
// truncated — reuses the row divider so it reads as the table's foot. Loses its
// divider when it's the only row (no properties resolved).
const incompletePropertiesStyles = css({
  paddingTop: "1.5",
  borderTopWidth: "1px",
  borderTopStyle: "solid",
  borderTopColor: "neutral.s40",
  color: "neutral.s90",
  fontSize: "xs",
  fontStyle: "italic",
  "&:first-child": {
    borderTopWidth: "0",
    paddingTop: "0",
  },
});

const goToButtonStyles = css({
  marginTop: "1",
  width: "full",
});

/**
 * Gaps that keep the card clear of its anchor: a node offsets by its drawn
 * radius (larger in the detailed view); an edge anchor uses fixed gaps.
 */
const gapsFor = (
  anchor: LocatedEntityPopoverAnchor,
): { x: number; y: number } =>
  anchor.type === "node"
    ? {
        x: anchor.nodeRadius + (anchor.variant === "compact" ? 5 : 3),
        y: anchor.nodeRadius + (anchor.variant === "compact" ? 0 : 3),
      }
    : { x: 10, y: 12 };

/**
 * Renders an SVG entity/type icon as a tintable mask: a `size`×`size` px box
 * filled with `currentColor` and clipped to the SVG shape (`center / contain`),
 * matching how `EntityOrTypeIcon` draws the served type icons elsewhere. The
 * colour is inherited from the surrounding icon style so a monochrome glyph reads
 * as cohesive with the label.
 */
const svgMaskStyle = (svgUrl: string, size: number): React.CSSProperties => ({
  width: size,
  height: size,
  backgroundColor: "currentColor",
  WebkitMaskImage: `url("${svgUrl}")`,
  maskImage: `url("${svgUrl}")`,
  WebkitMaskRepeat: "no-repeat",
  maskRepeat: "no-repeat",
  WebkitMaskPosition: "center",
  maskPosition: "center",
  WebkitMaskSize: "contain",
  maskSize: "contain",
});

// The type lozenge: the type's icon at the left, its label, and a dot in the
// type's colour at the right. Shared by node and link types.
const TypeChip = ({ chip }: { chip: LocatedEntityTypeChip }) => {
  const hasIcon =
    chip.icon?.emoji !== undefined || chip.icon?.svgUrl !== undefined;
  return (
    <span className={typeChipRecipe({ hasIcon })}>
      {chip.icon?.emoji !== undefined ? (
        <span className={chipIconStyles}>{chip.icon.emoji}</span>
      ) : chip.icon?.svgUrl !== undefined ? (
        <span
          aria-hidden="true"
          className={chipIconStyles}
          style={svgMaskStyle(chip.icon.svgUrl, 12)}
        />
      ) : null}
      <span className={chipLabelStyles}>{chip.label}</span>
      <span className={typeDotStyles} style={{ backgroundColor: chip.color }} />
    </span>
  );
};

/**
 * One from/to endpoint of a link: its type icon (emoji or ds glyph) + label.
 * A selectable endpoint (`onClick` set) renders its label as a link-style
 * button that jumps to that node; otherwise the label is plain text.
 */
const Endpoint = ({ endpoint }: { endpoint: LocatedEntityEndpoint }) => (
  <div className={endpointStyles}>
    {endpoint.icon?.emoji !== undefined ? (
      <span className={endpointIconStyles}>{endpoint.icon.emoji}</span>
    ) : endpoint.icon?.svgUrl !== undefined ? (
      <span
        aria-hidden="true"
        className={endpointIconStyles}
        style={svgMaskStyle(endpoint.icon.svgUrl, 12)}
      />
    ) : null}
    {endpoint.onClick ? (
      <button
        type="button"
        className={endpointButtonStyles}
        onClick={endpoint.onClick}
      >
        <span data-endpoint-label className={endpointButtonLabelStyles}>
          {endpoint.label}
        </span>
        <span data-endpoint-affordance className={endpointAffordanceStyles}>
          <Icon name="arrowRight" size="xs" />
        </span>
      </button>
    ) : (
      <span className={endpointLabelStyles}>{endpoint.label}</span>
    )}
  </div>
);

export const LocatedEntityPopover = ({
  triggerRef,
  anchor,
  detail,
  onClose,
  onGoTo,
  onActivate,
}: LocatedEntityPopoverProps) => {
  const gaps = gapsFor(anchor);
  // Both a node's and an edge's types render as chips beside the title.
  const chips = detail.types;
  return (
    <Popover
      triggerRef={triggerRef}
      position="bottom-start"
      positionFromPoint={{ x: anchor.x, y: anchor.y }}
      onClose={onClose}
      gapX={gaps.x}
      gapY={gaps.y}
      positionerClassName={lowLayerStyles}
    >
      <div
        className={cardStyles}
        onPointerDown={onActivate}
        onFocus={onActivate}
      >
        <div className={headerStyles}>
          <div className={titleStyles}>{detail.title}</div>

          {chips.map((chip) => (
            <TypeChip key={chip.label} chip={chip} />
          ))}

          {!detail.typesComplete ? (
            <span
              className={moreTypesStyles}
              title="Not all types are shown — open the entity to see them all"
            >
              + more
            </span>
          ) : null}
        </div>

        {detail.kind === "node" && detail.connectionCount > 0 ? (
          <div className={connectionCountStyles}>
            {formatConnectionCount(
              detail.connectionCount,
              detail.connectionsComplete,
            )}
          </div>
        ) : null}

        {detail.kind === "edge" ? (
          <div className={connectionSectionStyles}>
            <div className={connectionRowsStyles}>
              <div className={endpointRowStyles}>
                <div className={gutterStyles}>
                  <span className={gutterSpacerStyles} />
                  <span className={sourceDotStyles} />
                  <span className={railLineStyles} />
                </div>
                <Endpoint endpoint={detail.endpoints.from} />
              </div>
              <div className={endpointRowStyles}>
                <div className={gutterStyles}>
                  <span className={railLineStyles} />
                  <span
                    className={targetCaretStyles}
                    style={{
                      width: 0,
                      height: 0,
                      borderLeft: "3.5px solid transparent",
                      borderRight: "3.5px solid transparent",
                      borderTop: "5px solid var(--colors-neutral-s90)",
                    }}
                  />
                  <span className={gutterSpacerStyles} />
                </div>
                <Endpoint endpoint={detail.endpoints.to} />
              </div>
            </div>
          </div>
        ) : null}

        {detail.properties.length > 0 || !detail.propertiesComplete ? (
          <div className={propertyListStyles}>
            {detail.properties.map((property) => (
              <div key={property.key} className={propertyRowStyles}>
                <span className={propertyKeyStyles}>{property.key}</span>
                <span className={propertyValueStyles}>
                  {typeof property.value === "string"
                    ? property.value
                    : property.value.map((part, index) => (
                        // eslint-disable-next-line react/no-array-index-key
                        <span key={index} style={{ color: part.color }}>
                          {part.text}
                        </span>
                      ))}
                </span>
              </div>
            ))}
            {!detail.propertiesComplete ? (
              <div
                className={incompletePropertiesStyles}
                title="Not all properties are shown — open the entity to see them all"
              >
                + more
              </div>
            ) : null}
          </div>
        ) : null}

        {onGoTo ? (
          <Button
            variant="solid"
            tone="brand"
            size="sm"
            className={goToButtonStyles}
            onClick={onGoTo}
          >
            Go to entity
          </Button>
        ) : null}
      </div>
    </Popover>
  );
};
