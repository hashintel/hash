/**
 * What a visualizer may draw: the elements, attributes and style properties
 * its `element` nodes can carry, and the rule for attribute values.
 *
 * The sets are allowlists. A visualizer is a pure function of tokens and
 * parameters, and that alone does not make its output safe: an `<image>`
 * or `<a>` pointing at a URL built from token values leaks them to that
 * host, a `<script>` or `<foreignObject>` runs or embeds arbitrary content,
 * and an `on*` attribute is a function. None of those are here. CSS in a
 * value can load resources too (`url(...)`, `image-set(...)`), so a value
 * may only call the CSS functions listed below, and `url(...)` only as a
 * fragment reference, `url(#marker)`, the form `markerEnd`, `fill` and
 * `stroke` use for in-document definitions.
 *
 * The type checker reports violations with spans while editing; the
 * renderer applies the same sets again before anything reaches the DOM,
 * since attribute values may be computed at run time.
 */
import {
  isTokenBadURL,
  isTokenFunction,
  isTokenURL,
  tokenize,
} from "@csstools/css-tokenizer";

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

/**
 * CSS functions a value may call, by their unescaped lowercase name: colour,
 * gradient, shape, math, transform and timing functions, none of which takes a
 * resource. `var()` and `env()` substitute values the host page or browser
 * defined, since a visualizer cannot set custom properties; any fallback
 * they carry is checked with the rest of the value. Everything else is
 * refused, including the functions that load resources (`image-set()`,
 * `-webkit-image-set()`, `image()`, `cross-fade()`, `src()`, `paint()`,
 * `element()`) and any added to CSS later.
 */
const viewCssFunctions: ReadonlySet<string> = new Set([
  // colour
  "rgb",
  "rgba",
  "hsl",
  "hsla",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "color",
  "color-mix",
  "light-dark",
  // gradients, whose stops are colours and lengths
  "linear-gradient",
  "radial-gradient",
  "conic-gradient",
  "repeating-linear-gradient",
  "repeating-radial-gradient",
  "repeating-conic-gradient",
  // basic shapes on SVG's clipPath attribute
  "circle",
  "ellipse",
  "inset",
  "polygon",
  "path",
  "rect",
  "xywh",
  // math and sizing
  "calc",
  "min",
  "max",
  "clamp",
  "round",
  "mod",
  "rem",
  "abs",
  "sign",
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "atan2",
  "pow",
  "sqrt",
  "hypot",
  "log",
  "exp",
  "fit-content",
  // transforms, in CSS and in SVG's `transform` attributes
  "matrix",
  "matrix3d",
  "translate",
  "translatex",
  "translatey",
  "translatez",
  "translate3d",
  "scale",
  "scalex",
  "scaley",
  "scalez",
  "scale3d",
  "rotate",
  "rotatex",
  "rotatey",
  "rotatez",
  "rotate3d",
  "skew",
  "skewx",
  "skewy",
  "perspective",
  // transition timing
  "cubic-bezier",
  "steps",
  "linear",
  // substitution
  "var",
  "env",
]);

const fragmentReference = /^#[\w:.-]+$/u;

/**
 * Whether a string may be written as an attribute or style value.
 *
 * The value is read with a tokenizer that follows the CSS Syntax
 * specification browsers implement, so escapes such as `u\72l(` and
 * comments resolve to the names a browser would see, at any depth of
 * nesting. Every function must be one of the CSS functions above, and
 * `url(...)` an unquoted fragment reference to this picture: anything that loads a
 * resource could send token data to another host. A value the tokenizer has
 * to repair (an unterminated string or `url(`) is refused rather than
 * guessed at. Both function and `url(...)` tokens need a literal `(`, which
 * no escape produces, so a value without one (plain text, numbers, path
 * data, font names) holds neither and is accepted without tokenizing.
 */
export const isSafeViewValue = (value: string): boolean => {
  if (!value.includes("(")) {
    return true;
  }
  const parseErrors: unknown[] = [];
  const tokens = tokenize(
    { css: value },
    { onParseError: (error) => parseErrors.push(error) },
  );
  if (parseErrors.length > 0) {
    return false;
  }
  return tokens.every((token) => {
    if (isTokenBadURL(token)) {
      return false;
    }
    if (isTokenURL(token)) {
      return fragmentReference.test(token[4].value);
    }
    if (isTokenFunction(token)) {
      // Quoted URLs are function tokens, so they remain outside the
      // supported unquoted `url(#id)` syntax, including local ones.
      return viewCssFunctions.has(token[4].value.toLowerCase());
    }
    return true;
  });
};
