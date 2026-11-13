# @hashintel/ds-icons

## 0.1.0

### Minor Changes

- Add more (and improve existing) icon descriptions and specified 'related' icons, covering the entire catalog. ([@vilkinsons](https://github.com/vilkinsons), [#10284](https://github.com/hashintel/hash/pull/10284))

  Add explicit 'one-time' and 'continuous' animation modes per icon (excluding loading indicators and the existing `active` loop shorthand). Previously icons utilized one or the other inconsistently.

  Add new icons: the existing 'numerical' sort icons are joined by new ones for type (shape), size, alphabetical, or general/other sorting.

  Add filled artwork for closed symbols across modeling, files, notifications, status, and other controls. Keep interior details transparent on any background and preserve hover, drawing, and state transitions in both variants.

  Give Arrows Left Right complete arrowheads in both directions.

- Add the official MCP Server symbol and separate test-tube, successful-test and failed-test icons. The previous checked test tube is available as `testTubeCheck`; `testTube` now has no result mark. ([@vilkinsons](https://github.com/vilkinsons), [#10354](https://github.com/hashintel/hash/pull/10354))

### Patch Changes

- Add chain-link and broken-link icons for hyperlinks, section anchors, and disconnected relationships. Use `HashIcon` with `name="link"` or `"linkBroken"`, the `LinkIcon` and `LinkBrokenIcon` exports, or `hashIconPack.link` and `hashIconPack.linkBroken`. Refine the external-link icon with a rounded frame, a more compact arrowhead, and a clearer opening around the arrow. ([@vilkinsons](https://github.com/vilkinsons), [#10352](https://github.com/hashintel/hash/pull/10352))
- Updated dependencies:
  - @hashintel/ds-helpers@0.3.0

## 0.0.3

### Patch Changes

- Add a `circleClose` icon ([@alex-e-leon](https://github.com/alex-e-leon), [#10162](https://github.com/hashintel/hash/pull/10162))

## 0.0.2

### Patch Changes

- Republish to fix `@hashintel/ds-helpers` dependency range. ([@CiaranMn](https://github.com/CiaranMn), [#10089](https://github.com/hashintel/hash/pull/10089))

## 0.0.1

### Patch Changes

- Add `@hashintel/ds-icons`, HASH's animated SVG icon set: `HashIcon` and named icon components with adjustable stroke weight, motion and reduced-motion support. `hashIconPack` maps every `@hashintel/ds-components` icon name to the set for `IconProvider`, and a Panda preset and build info are included. ([@aacarcrash](https://github.com/aacarcrash), [#9981](https://github.com/hashintel/hash/pull/9981))
