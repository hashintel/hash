/**
 * What a visualizer may draw: the elements, attributes and style properties
 * its `element` nodes can carry, and the rule for attribute values.
 *
 * The sets are allowlists. A visualizer is a pure function of tokens and
 * parameters, and that alone does not make its output safe: an `<image>`
 * or `<a>` pointing at a URL built from token values leaks them to that
 * host, a `<script>` or `<foreignObject>` runs or embeds arbitrary content,
 * and an `on*` attribute is a function. None of those are here. `url(...)`
 * in a value is accepted only as a fragment reference, `url(#marker)`, the
 * form `markerEnd`, `fill` and `stroke` use for in-document definitions.
 *
 * The type checker reports violations with spans while editing; the
 * renderer applies the same sets again before anything reaches the DOM,
 * since attribute values may be computed at run time.
 */

/** SVG drawing, container, text and paint-server elements; a few HTML
 * containers for labels around a picture. */
export const VIEW_ELEMENT_TAGS: ReadonlySet<string> = new Set([
  "svg",
  "g",
  "defs",
  "symbol",
  "marker",
  "clipPath",
  "mask",
  "pattern",
  "linearGradient",
  "radialGradient",
  "stop",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "path",
  "text",
  "tspan",
  "textPath",
  "title",
  "desc",
  "div",
  "span",
  "p",
]);

/**
 * Attribute names as written in JSX (React's camelCase spelling). Geometry,
 * presentation, text and paint-server attributes, `id` for in-document
 * references, `style` for a record of the properties below. No `href`,
 * `xlinkHref`, `src`, `on*`, `ref`, `className` or `dangerouslySetInnerHTML`.
 */
export const VIEW_ELEMENT_ATTRIBUTES: ReadonlySet<string> = new Set([
  // identity and layout
  "id",
  "style",
  "width",
  "height",
  "viewBox",
  "preserveAspectRatio",
  "transform",
  "transformOrigin",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "dx",
  "dy",
  "d",
  "points",
  "pathLength",
  "rotate",
  "textLength",
  "lengthAdjust",
  "startOffset",
  // paint
  "fill",
  "fillOpacity",
  "fillRule",
  "stroke",
  "strokeWidth",
  "strokeOpacity",
  "strokeLinecap",
  "strokeLinejoin",
  "strokeMiterlimit",
  "strokeDasharray",
  "strokeDashoffset",
  "opacity",
  "color",
  "stopColor",
  "stopOpacity",
  "offset",
  "paintOrder",
  "vectorEffect",
  "shapeRendering",
  "visibility",
  "display",
  "overflow",
  "clipPath",
  "clipRule",
  "mask",
  "markerStart",
  "markerMid",
  "markerEnd",
  // text
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "textAnchor",
  "dominantBaseline",
  "alignmentBaseline",
  "letterSpacing",
  "wordSpacing",
  "textDecoration",
  "writingMode",
  // markers, gradients, patterns, clips
  "markerWidth",
  "markerHeight",
  "markerUnits",
  "refX",
  "refY",
  "orient",
  "gradientUnits",
  "gradientTransform",
  "spreadMethod",
  "fx",
  "fy",
  "patternUnits",
  "patternContentUnits",
  "patternTransform",
  "clipPathUnits",
  "maskUnits",
  "maskContentUnits",
]);

/** CSS properties a `style` record may set, in React's camelCase spelling. */
export const VIEW_STYLE_PROPERTIES: ReadonlySet<string> = new Set([
  "width",
  "height",
  "maxWidth",
  "maxHeight",
  "minWidth",
  "minHeight",
  "display",
  "overflow",
  "margin",
  "padding",
  "border",
  "borderRadius",
  "borderColor",
  "borderWidth",
  "background",
  "backgroundColor",
  "color",
  "opacity",
  "fill",
  "stroke",
  "strokeWidth",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "textAlign",
  "lineHeight",
  "letterSpacing",
  "whiteSpace",
  "transform",
  "transformOrigin",
  "transition",
  "cursor",
  "pointerEvents",
  "userSelect",
]);

const URL_FUNCTION = /url\s*\(/iu;
const FRAGMENT_URL = /^url\(\s*#[\w:.-]+\s*\)$/u;

/**
 * Whether a string may be written as an attribute or style value. Any
 * `url(...)` must be a fragment reference: a remote URL would load from, or
 * send token data to, another host.
 */
export const isSafeViewValue = (value: string): boolean =>
  !URL_FUNCTION.test(value) || FRAGMENT_URL.test(value.trim());
