/**
 * The selection popover for the Atlas network graph: a compact white entity card
 * anchored to the selected node/edge, showing the located item's title, its
 * type chip, its simple-value properties (nodes), and a "Go to entity" action.
 * Used by the entities-visualizer network graph view.
 *
 * Purely presentational — the consumer decodes a {@link fetchLocate} response
 * into {@link LocatedEntityDetail} and owns the
 * {@link LocatedEntityPopoverProps.onGoTo} behaviour; this file only lays the
 * card out (reusing the {@link Badge} and {@link Button} primitives) and
 * positions it via {@link Popover}. Every text run is clamped so a long label or
 * value can't stretch or overflow the card.
 *
 * The {@link Popover} portals its content, so a consumer that scopes the ds Panda
 * tokens to a subtree (rather than globally) must supply a `PortalContainerContext`
 * inside that scope, or the card's token-based colours won't resolve.
 */

import {
  Badge,
  Button,
  Icon,
  type IconName,
  Popover,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

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

/** A type chip: a label and the colour of its leading dot. */
export interface LocatedEntityTypeChip {
  readonly label: string;
  readonly color: string;
}

/**
 * A type icon the card renders: an emoji glyph drawn as text, or a
 * design-system {@link IconName} drawn as an SVG (the shape an SVG type icon
 * resolves to via `iconNameFromEntityIcon`, which text surfaces can't draw
 * directly). At most one is set; `emoji` wins when both are.
 */
export interface LocatedEntityIcon {
  readonly emoji?: string;
  readonly name?: IconName;
}

/**
 * One endpoint entity of a link, shown in the edge card's from→to row: the
 * entity's label and its type icon.
 */
export interface LocatedEntityEndpoint {
  readonly label: string;
  readonly icon?: LocatedEntityIcon;
}

interface LocatedEntityDetailShared {
  /** Bold card title — the entity/edge label. */
  readonly title: string;
  /** Optional leading emoji icon. */
  readonly icon?: string;
  /** Property rows shown in the card's property table. */
  readonly properties: readonly LocatedEntityProperty[];
}

/** A located node: one optional type chip floats beside the title. */
export interface LocatedNodeDetail extends LocatedEntityDetailShared {
  readonly kind: "node";
  /** Type chip: a label and the colour of its dot. */
  readonly type?: LocatedEntityTypeChip;
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
  rowGap: "1.5",
});

const titleStyles = css({
  fontSize: "base",
  fontWeight: "[700]",
  color: "neutral.s120",
  lineHeight: "tight",
  lineClamp: "2",
});

// A dedicated span keeps a gap after the emoji, which the line-clamp box
// (`-webkit-box`) would otherwise trim from an inline trailing space.
const titleIconStyles = css({
  marginRight: "1.5",
});

/** Truncates a long type label inside the {@link Badge} chip, at readable contrast. */
const chipLabelStyles = css({
  truncate: true,
  maxWidth: "[160px]",
  color: "neutral.s110",
});

const typeDotStyles = css({
  width: "[6px]",
  height: "[6px]",
  borderRadius: "full",
  flexShrink: "0",
});

// The link's from→to endpoints beneath the header: the `from` entity, then the
// `to` entity prefixed with a rightward arrow. The row wraps, so the two sit on
// one line when they fit and the arrow-led `to` drops onto its own line when
// they don't (the arrow travels with `to` — see `endpointToLineStyles`). Each
// endpoint's label truncates within its line's remaining width.
const endpointsRowStyles = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  columnGap: "2",
  rowGap: "1",
  paddingTop: "2",
  borderTopWidth: "1px",
  borderTopStyle: "solid",
  borderTopColor: "neutral.s40",
});

const endpointStyles = css({
  display: "flex",
  minWidth: "0",
  alignItems: "center",
  gap: "1",
});

// The `to` line: the arrow sits inline before the endpoint and never shrinks.
const endpointToLineStyles = css({
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

const endpointArrowStyles = css({
  flexShrink: "0",
  color: "neutral.s70",
});

const propertyListStyles = css({
  display: "flex",
  flexDirection: "column",
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

/** The grey type chip with a coloured dot — shared by node and link types. */
const TypeChip = ({ chip }: { chip: LocatedEntityTypeChip }) => (
  <Badge
    colorScheme="gray"
    size="sm"
    iconLeft={
      <span className={typeDotStyles} style={{ backgroundColor: chip.color }} />
    }
  >
    <span className={chipLabelStyles}>{chip.label}</span>
  </Badge>
);

/** One from/to endpoint of a link: its type icon (emoji or ds glyph) + label. */
const Endpoint = ({ endpoint }: { endpoint: LocatedEntityEndpoint }) => (
  <div className={endpointStyles}>
    {endpoint.icon?.emoji !== undefined ? (
      <span className={endpointIconStyles}>{endpoint.icon.emoji}</span>
    ) : endpoint.icon?.name !== undefined ? (
      <Icon
        name={endpoint.icon.name}
        size="xs"
        className={endpointIconStyles}
      />
    ) : null}
    <span className={endpointLabelStyles}>{endpoint.label}</span>
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
  // Node → its single optional type chip; edge → its link types.
  const chips =
    detail.kind === "edge" ? detail.types : detail.type ? [detail.type] : [];
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
          <div className={titleStyles}>
            {detail.icon ? (
              <span className={titleIconStyles}>{detail.icon}</span>
            ) : null}
            {detail.title}
          </div>

          {chips.map((chip) => (
            <TypeChip key={chip.label} chip={chip} />
          ))}
        </div>

        {detail.kind === "edge" ? (
          <div className={endpointsRowStyles}>
            <Endpoint endpoint={detail.endpoints.from} />
            <div className={endpointToLineStyles}>
              <Icon
                name="arrowRight"
                size="xs"
                className={endpointArrowStyles}
              />
              <Endpoint endpoint={detail.endpoints.to} />
            </div>
          </div>
        ) : null}

        {detail.properties.length > 0 ? (
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
