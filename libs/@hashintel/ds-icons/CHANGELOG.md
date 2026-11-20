# @hashintel/ds-icons

## 0.1.0

### Minor Changes

- Add 356 interface icons for navigation, files, editing, layout, people, business, science, and logistics, including Thermometer Hot and Open Source Initiative. Each icon includes a description, adjustable weight, and outline and filled styles. ([#10537](https://github.com/hashintel/hash/pull/10537))

- Add 14 logic and verification icons covering Boolean operators, quantifiers, equivalence, implication, temporal properties, branching, constraints, counterexamples, and robustness. Each icon supports outline and filled styles and adjustable weight, with a description and related-icon metadata. ([#10537](https://github.com/hashintel/hash/pull/10537))

- Add more (and improve existing) icon descriptions and specified 'related' icons, covering the entire catalog. ([#10284](https://github.com/hashintel/hash/pull/10284))

  Add explicit 'one-time' and 'continuous' animation modes per icon (excluding loading indicators and the existing `active` loop shorthand). Previously icons utilized one or the other inconsistently.

  Add new icons: the existing 'numerical' sort icons are joined by new ones for type (shape), size, alphabetical, or general/other sorting.

  Add filled artwork for closed symbols across modeling, files, notifications, status, and other controls. Keep interior details transparent on any background and preserve hover, drawing, and state transitions in both variants.

  Give Arrows Left Right complete arrowheads in both directions.

- Align the icon family with HASH Sans through flat terminals, tighter corners, square punctuation, and a lighter stroke scale. Refine diagram, notation, navigation, and action shapes for small sizes, and keep animated curve endpoints and range bounds attached. The default stroke changes from 2 to 1.75; explicit strokeWidth overrides remain supported. ([#10533](https://github.com/hashintel/hash/pull/10533))

- Add the official MCP Server symbol and separate test-tube, successful-test and failed-test icons. The previous checked test tube is available as `testTubeCheck`; `testTube` now has no result mark. ([#10354](https://github.com/hashintel/hash/pull/10354))

- Add 38 icons covering monitoring instruments and sensors, gas molecules, particulate measurements, water and weather, power and signal status, and common interface actions, with outline and filled styles and static exports. Center the File Plus symbol, lighten the File Audio notes, and tighten the File Code brackets. Give Dash icons distinct flex, shimmer, dot-wave, and wiggle actions, and animate the inner details of File Plus, File Audio, File Code, Scan Line, and Signal while keeping their frames steady. The actions support one-time and continuous playback and respect reduced-motion settings. ([#10552](https://github.com/hashintel/hash/pull/10552))

  Add 108 shortcut keycap icons covering A–Z, digits, punctuation, F1–F12, common modifiers, and navigation keys. Redraw Keycap K with a consistent sans-serif legend.

  Improve spacing and readability in Search Chart, Ballot Check, Keyboard, Handshake, Plane Tail, and the person-with-badge icons. Standardize the person shape shared by Hospital User and Expert Interviews, strengthen Building Shield, and correct crowded details and inconsistent strokes in File Box, File Invoice Dollar, Box Location, Map Pin, Truck Plane, Plane Arrival, and Plane Departure.

- Add paired date, duration, priority, and empty-value sort icons with named components, catalog descriptions, related icons, and directional hover feedback. Empty-value markers keep their hollow and solid meanings in both styles. ([#10533](https://github.com/hashintel/hash/pull/10533))

- Add `@hashintel/ds-icons/static` with React components that render the canonical icon drawings without Panda CSS or animation. The components declare a client boundary for server-rendered hosts. Expose SVG markup helpers for server and canvas rendering through `@hashintel/ds-icons/artwork`. ([#10537](https://github.com/hashintel/hash/pull/10537))

- Add six temporal-logic icons for bounded signals, signal thresholds, signal timing, state sequences, temporal operators, and Boolean traces, with named exports, catalog descriptions, related icons, and motion hints. ([#10533](https://github.com/hashintel/hash/pull/10533))

### Patch Changes

- Improve Timeline Arrow, Chart Network, Tools, Share Nodes, Globe Nodes, spline handles, History User, History Pages, Warning, and Open Source Initiative for consistent spacing, clear connections, and legibility across weights. Keep the heaviest Warning outline within its viewport. Keep Arrowhead Arrow open in both styles, distinct from the closed triangle endpoint. Keep Logic Next's filled state marker free of an outline at every weight. Radar now has evenly spaced open rings without a blip, and its action animation rotates the line and gaps through one clockwise turn within the viewport while respecting reduced-motion preferences. ([#10537](https://github.com/hashintel/hash/pull/10537))

- Describe every canonical icon in one sentence about its shape and meaning, keeping animation details separate from the description. ([#10533](https://github.com/hashintel/hash/pull/10533))

- Add chain-link and broken-link icons for hyperlinks, section anchors, and disconnected relationships. Use `HashIcon` with `name="link"` or `"linkBroken"`, the `LinkIcon` and `LinkBrokenIcon` exports, or `hashIconPack.link` and `hashIconPack.linkBroken`. Refine the external-link icon with a rounded frame, a more compact arrowhead, and a clearer opening around the arrow. ([#10352](https://github.com/hashintel/hash/pull/10352))

- Give the inner marks of information, error, warning, circle-check, and diamond-exclamation icons more space inside their existing outlines, including the cutouts in Filled style. ([#10533](https://github.com/hashintel/hash/pull/10533))

- Return empty artwork for invalid runtime icon names or styles, including inherited object keys. Keep static SVG rendering restricted to bundled drawings and sanitized instance IDs. ([#10537](https://github.com/hashintel/hash/pull/10537))
- Updated dependencies:
  - @hashintel/ds-helpers@0.3.0

## 0.0.3

### Patch Changes

- Add a `circleClose` icon ([#10162](https://github.com/hashintel/hash/pull/10162))

## 0.0.2

### Patch Changes

- Republish to fix `@hashintel/ds-helpers` dependency range. ([#10089](https://github.com/hashintel/hash/pull/10089))

## 0.0.1

### Patch Changes

- Add `@hashintel/ds-icons`, HASH's animated SVG icon set: `HashIcon` and named icon components with adjustable stroke weight, motion and reduced-motion support. `hashIconPack` maps every `@hashintel/ds-components` icon name to the set for `IconProvider`, and a Panda preset and build info are included. ([#9981](https://github.com/hashintel/hash/pull/9981))
