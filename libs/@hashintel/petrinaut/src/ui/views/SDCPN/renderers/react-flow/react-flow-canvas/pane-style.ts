import { css } from "@hashintel/ds-helpers/css";

/**
 * The pane of the canvas: the element around React Flow. It holds the clocks
 * of a fold and of a focus, and every rule that fades what is outside the
 * focused neighbourhood: the arcs, the nodes and the shapes of the minimap.
 */
export const paneStyle = css({
  width: "[100%]",
  height: "[100%]",
  "--canvas-fold-easing": "cubic-bezier(0.22, 1, 0.36, 1)",
  "&[data-animated=false]": {
    "--canvas-fold-duration": "0ms",
  },
  "@media (prefers-reduced-motion: reduce)": {
    "--canvas-fold-duration": "0ms",
  },
  "& .react-flow__pane": {
    cursor: `var(--pane-cursor) !important`,
  },
  // React Flow positions each edge's `svg` with no insets, and such a box is
  // never a layout root: an arc that moves lays out the pane. With the insets
  // it already sits at, the layout stops at the arc.
  "& .react-flow__edges svg": { top: "[0]", left: "[0]" },
  "& .arc-strokes, & .minimap-shape": {
    transition: "[opacity var(--canvas-focus-duration, 200ms) ease]",
    "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
  },
  // The fade of the nodes: see the rules that set these colours, below. The
  // card or box of a node fades by `nodeFocusStyle`, and a part that moves
  // with a fold by a transition of its own. The border of a part and the fill
  // of an inlay change at once: each is a hairline or a shade of its card
  // that no eye follows, and every transition a fade starts is work on every
  // frame of it.
  "& :is(.node-text, .node-fill, .node-cover):not(.node-surface):not(.node-folds)":
    {
      transition:
        "[color var(--canvas-focus-duration, 200ms) ease, background-color var(--canvas-focus-duration, 200ms) ease]",
      "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
    },
  "& .react-flow__node svg :is(path, circle, ellipse, rect, line, polyline, polygon)":
    {
      transition: "[stroke-opacity var(--canvas-focus-duration, 200ms) ease]",
      "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
    },
  "& .react-flow__node svg[fill=currentColor] :is(path, circle, ellipse, rect, line, polyline, polygon)":
    {
      transition:
        "[stroke-opacity var(--canvas-focus-duration, 200ms) ease, fill-opacity var(--canvas-focus-duration, 200ms) ease]",
      "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
    },
  // The fade of the arcs: see the rules that set these opacities, below.
  "& .arc-shaft, & .arc-pulse, & .fusion-line": {
    transition: "[stroke-opacity var(--canvas-focus-duration, 200ms) ease]",
    "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
  },
  // The second stroke of a line comes back once the line has faded back in:
  // any sooner and it would show through the line.
  "& .arc-line": {
    transition:
      "[stroke-opacity 0s linear var(--canvas-focus-duration, 200ms)]",
    "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
  },
  "& .arc-head": {
    transition: "[fill-opacity var(--canvas-focus-duration, 200ms) ease]",
    "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
  },
  // A component instance's height animates between folded and unfolded, so
  // the card grows and shrinks rather than jumping. React Flow reads the pins
  // again on every frame the node resizes, which keeps the links on them.
  "& .react-flow__node.react-flow__node-componentInstance": {
    transition:
      "[height var(--canvas-fold-duration, 180ms) var(--canvas-fold-easing)]",
    "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
  },
  // A node outside the neighbourhood recedes from here, whole: card, label,
  // token count and handles together, so nothing of it stays at full strength
  // while the neighbourhood carries the colour. A node React Flow has marked
  // selected is kept out of the fade as well: a drag-selection marks nodes
  // before the change reaches the editor's selection, and until it does they
  // wear the focus ring, so they must not be faded under it.
  //
  // No opacity goes on a node, or on an element inside one that draws more
  // than one thing. For such an opacity the browser draws the element into a
  // buffer of its own, on every frame of a pan, a zoom or a drag, and a net
  // has one per node. So each thing a faded node draws is drawn at 0.4 by the
  // alpha of its own colour, and what lies behind the node shows through it
  // as it would through an opacity. `node-fade.ts` names the classes these
  // rules find the parts by.
  //
  // No rule here changes what an element hands down to the elements inside
  // it. A custom property or a `color` set on a faded node would restyle
  // every element of every node, at the change of focus and on every frame
  // of the fade.
  //
  // A change of focus restyles more than the parts of the faded nodes. The
  // browser looks again at every element under the pane that a rule here
  // could apply to by its last selector, whatever comes before it: every
  // part with one of these classes, and for the rule of the icons every
  // shape, which the paths of the arcs and of the minimap are too. A shape
  // of an icon has no class for that rule to end in. No other rule ends in
  // something the pane has many of outside the parts.
  //
  // The card or box. Its fill stops at its border, which would darken over
  // it. The ring of a classic box is its faded twin. The elevation under the
  // node goes: at 0.4 it would darken the canvas by 4 of 255 at most, and a
  // blurred shadow is the costliest thing a card draws on every frame of a
  // pan. The delay is the one a compact place's fill needs: see
  // `placeCardStyle`.
  "&[data-focus-active] .react-flow__node:not(.canvas-focus-role):not(.selected) .node-surface":
    {
      backgroundColor:
        "[var(--node-faded-fill, color-mix(in srgb, var(--node-fill) 40%, transparent))]",
      backgroundImage: "[var(--node-faded-fill-image, none)]",
      backgroundClip: "[padding-box]",
      boxShadow:
        "[var(--node-faded-outline-ring, 0 0 #0000), var(--focus-glow, 0 0 0 3px #fff0)]",
      transitionDelay: "[0s]",
    },
  // Text. A text with a colour of its own names it as `--node-text`, and
  // any other inherits one. `color` is inherited, so the class goes on the
  // element that holds the text and has no element inside it.
  "&[data-focus-active] .react-flow__node:not(.canvas-focus-role):not(.selected) .node-text":
    {
      color:
        "[color-mix(in srgb, var(--node-text, currentColor) 40%, transparent)]",
    },
  "&[data-focus-active] .react-flow__node:not(.canvas-focus-role):not(.selected) .node-fill":
    {
      backgroundColor:
        "[color-mix(in srgb, var(--node-fill) 40%, transparent)]",
    },
  "&[data-focus-active] .react-flow__node:not(.canvas-focus-role):not(.selected) .node-border":
    {
      borderColor:
        "[color-mix(in srgb, var(--node-border, currentColor) 40%, transparent)]",
    },
  "&[data-focus-active] .react-flow__node:not(.canvas-focus-role):not(.selected) .node-inlay":
    {
      backgroundColor: "[transparent]",
    },
  // A part that hides what it lies on stays opaque, and mixes toward the
  // colour of the canvas, which the editor and the preview paint behind this
  // pane. So do its text and its border, where it has them.
  "&[data-focus-active] .react-flow__node:not(.canvas-focus-role):not(.selected) .node-cover":
    {
      backgroundColor:
        "[color-mix(in srgb, var(--node-fill) 40%, var(--colors-neutral-s25))]",
    },
  "&[data-focus-active] .react-flow__node:not(.canvas-focus-role):not(.selected) .node-cover.node-text":
    {
      color:
        "[color-mix(in srgb, var(--node-text, currentColor) 40%, var(--colors-neutral-s25))]",
    },
  "&[data-focus-active] .react-flow__node:not(.canvas-focus-role):not(.selected) .node-cover.node-border":
    {
      borderColor:
        "[color-mix(in srgb, var(--node-border) 40%, var(--colors-neutral-s25))]",
    },
  // The outline of a node an arc is being drawn onto. Its handle names the
  // colour, and says that the outline is drawn with an attribute that no
  // other handle has. No rule here ends in a class that every handle has:
  // the browser would restyle the handles of every node at each change of
  // focus to find the one it applies to. So the dot a node under the pointer
  // offers an arc from, and the outline of keyboard focus on a handle, are
  // drawn at full strength on a faded node.
  "&[data-focus-active] .react-flow__node:not(.canvas-focus-role):not(.selected) [data-arc-target]::after":
    {
      outlineColor:
        "[color-mix(in srgb, var(--node-outline, transparent) 40%, transparent)]",
    },
  // An icon keeps its colour, and each of its shapes fades by the opacity of
  // its fill and of its stroke. The bolt of a firing is left out: it is drawn
  // for the length of its animation, which fades it.
  "&[data-focus-active] .react-flow__node:not(.canvas-focus-role):not(.selected) :not(.node-bolt) > svg :is(path, circle, ellipse, rect, line, polyline, polygon)":
    {
      fillOpacity: "[0.4]",
      strokeOpacity: "[0.4]",
    },
  // A filled icon is a fill under a stroke of the same colour, and both at
  // 0.4 would show the inner half of the stroke as a darker rim. So its
  // stroke goes, and the shape is smaller by half the width of that stroke.
  "&[data-focus-active] .react-flow__node:not(.canvas-focus-role):not(.selected) :not(.node-bolt) > svg[fill=currentColor] :is(path, circle, ellipse, rect, line, polyline, polygon)":
    {
      strokeOpacity: "[0]",
    },
  // An arc outside the neighbourhood recedes from here, so a hover leaves
  // every arc it did not touch alone. Only the strokes fade: an arc's weight
  // is worth reading whether or not the arc carrying it is in focus.
  //
  // No opacity goes on an element that every arc has. For an opacity on a
  // group the browser draws the group into a buffer of its own, on every
  // frame of a pan, a zoom or a drag, and a net has one group per arc. So
  // each thing a faded arc draws is drawn once, at 0.45 by an opacity of its
  // own: the line by its stroke and the head by its fill. What would lie
  // under another is not drawn, since both would show: the line is the
  // shaft, which stops where the head begins, and the second stroke of the
  // line goes, at once.
  //
  // The arcs at rest are drawn together, a few paths for each run of them,
  // and fade there: no arc at rest has a role. An arc that draws its own
  // strokes has them in a group that says whether it has one, and fades
  // unless it does. The rules name that group and its children: React Flow's
  // wrapper around the arc layer is an edge with no role too, and a rule
  // that matched through it would fade every arc.
  "&[data-focus-active] .arc-run > .arc-shaft, &[data-focus-active] .arc-own:not(.canvas-focus-role) > .arc-shaft, &[data-focus-active] .react-flow__edge-fusion:not(.canvas-focus-role) .fusion-line":
    {
      strokeOpacity: "[0.45]",
    },
  "&[data-focus-active] .arc-run > .arc-line, &[data-focus-active] .arc-own:not(.canvas-focus-role) > .arc-line":
    {
      strokeOpacity: "[0]",
      transition: "[none]",
    },
  "&[data-focus-active] .arc-run > .arc-head, &[data-focus-active] .arc-own:not(.canvas-focus-role) > .arc-head":
    {
      fillOpacity: "[0.45]",
    },
  // The pulse of a firing is the whole line, which runs on under the head.
  // On a faded arc it stops where the head begins, as the line does: a pulse
  // says what share of its length that is.
  "&[data-focus-active] .arc-run > .arc-pulses > .arc-pulse, &[data-focus-active] .arc-own:not(.canvas-focus-role) > .arc-pulses > .arc-pulse":
    {
      strokeOpacity: "[0.45]",
      strokeDasharray: "[var(--arc-faded-dash)]",
    },
  // Marks that lie on their line can only fade with it as one group: the
  // ticks, the circle and the dot of an inhibitor or a read arc, and the knot
  // of a fusion link. Those keep an opacity, and a net has few of them.
  "&[data-focus-active] .arc-own.arc-strokes:not(.canvas-focus-role), &[data-focus-active] .react-flow__edge-fusion:not(.canvas-focus-role) .arc-strokes":
    {
      opacity: "[0.45]",
    },
  // A minimap shape outside the neighbourhood drops right back: the map is
  // small enough that anything short of that competes with the neighbourhood.
  "&[data-focus-active] .minimap-shape:not(.canvas-focus-role)": {
    opacity: "[0.12]",
  },
});
