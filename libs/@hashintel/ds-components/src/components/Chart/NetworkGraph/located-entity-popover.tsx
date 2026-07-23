/**
 * The selection popover for the Atlas network graph: a compact white entity card
 * anchored to the selected node/edge, showing the located item's title, its
 * type chip, its simple-value properties (nodes), and a "Go to entity" action.
 * Used by the tiling Ladle story and the entities-visualizer network graph view.
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

import { css } from "@hashintel/ds-helpers/css";

import { Badge } from "../../Badge/badge";
import { Button } from "../../Button/button";
import { Popover } from "../../Popover/popover";

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

/** The presentational detail the card renders for a located node or edge. */
export interface LocatedEntityDetail {
  readonly kind: "node" | "edge";
  /** Bold card title — the entity/edge label. */
  readonly title: string;
  /** Optional leading emoji icon. */
  readonly icon?: string;
  /** Type chip: a label and the colour of its dot. */
  readonly type?: { readonly label: string; readonly color: string };
  /** Property rows (nodes carry these; edges leave it empty). */
  readonly properties: readonly LocatedEntityProperty[];
}

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
  minWidth: "[200px]",
  maxWidth: "[260px]",
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
  color: "neutral.s100",
  fontSize: "sm",
  truncate: true,
});

const propertyValueStyles = css({
  minWidth: "0",
  color: "neutral.s120",
  fontSize: "sm",
  fontWeight: "semibold",
  textAlign: "right",
  truncate: true,
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

export const LocatedEntityPopover = ({
  triggerRef,
  anchor,
  detail,
  onClose,
  onGoTo,
  onActivate,
}: LocatedEntityPopoverProps) => {
  const gaps = gapsFor(anchor);
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

          {detail.type ? (
            <Badge
              colorScheme="gray"
              size="sm"
              iconLeft={
                <span
                  className={typeDotStyles}
                  style={{ backgroundColor: detail.type.color }}
                />
              }
            >
              <span className={chipLabelStyles}>{detail.type.label}</span>
            </Badge>
          ) : null}
        </div>

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
