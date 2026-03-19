# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Package Overview

`@hashintel/refractive` is a React library that applies refractive glass effects to components using SVG filters. It lives in the HASH monorepo at `libs/@hashintel/refractive`.

## Commands

```bash
# Build the library (outputs to dist/)
yarn build              # or: turbo run build --filter '@hashintel/refractive'

# Run Storybook for visual development (port 6006)
yarn dev

# Build in watch mode for consumers
yarn dev:lib

# Lint
yarn lint:eslint        # oxlint (not ESLint)
yarn lint:tsc           # tsgo (native TypeScript)

# Fix lint issues
yarn fix:eslint
```

## Architecture

The library exports two things from `src/main.ts`:

1. **`refractive`** — a Proxy-based HOC that wraps any React component or HTML element (`refractive.div`, `refractive(MyComponent)`) to apply a refractive glass effect via `backdrop-filter: url(#filterId)`.
2. **Surface equation functions** (`convex`, `concave`, `convexCircle`, `lip`) — mathematical curves used to shape the bezel height profile.

### Rendering Pipeline

1. **`refractive` HOC** (`src/hoc/refractive.tsx`) — Observes element size via `ResizeObserver`, renders a hidden `<svg>` containing the `<Filter>` alongside the wrapped component.
2. **`Filter`** (`src/components/filter.tsx`) — Orchestrates the SVG filter graph:
   - Computes a **displacement map** (refraction) and **specular map** (highlights) as `ImageData` bitmaps.
   - Feeds them to `CompositeParts` which slices each bitmap into 9-patch parts (4 corners, 4 edges, 1 center) for stretching to any element size.
   - Chains SVG filter primitives: `feGaussianBlur` → `feDisplacementMap` → specular overlay via `feComposite`.
3. **Map generators** (`src/maps/`):
   - `displacement-map.ts` — Computes per-pixel refraction offsets using Snell's law, with configurable glass thickness, bezel width, and refractive index. Uses `calculateRoundedSquareMap` for distance-to-border computation.
   - `specular.ts` — Computes specular highlight intensity based on dot product with a light angle vector. Uses `calculateCircleMap`.
   - `calculate-rounded-square-map.ts` / `calculate-circle-map.ts` — Iterate over pixels, compute distance-from-border fields, and call a `processPixel` callback to fill RGBA buffers.
4. **Helpers** (`src/helpers/`):
   - `split-imagedata-to-parts.ts` — Slices an `ImageData` into the 9-patch data URLs.
   - `image-data-to-url.ts` — Converts `ImageData` to a base64 data URL via `OffscreenCanvas`.

### Key Design Decisions

- **9-patch compositing**: Displacement/specular maps are generated once at the corner size, then split into 9 regions and stretched via `<feImage>` + `<feComposite>` to handle any element dimensions without regenerating the full bitmap.
- **Pixel ratio**: Maps are rendered at `pixelRatio: 6` for quality, independent of device pixel ratio.
- **ResizeObserver dependency**: Currently required to pass explicit width/height to the SVG filter. There's a TODO (FE-43) to switch to `objectBoundingBox` filter units to eliminate this.

## Roadmap: Toward a Fully Declarative SVG Filter

The library is evolving from rasterized bitmap computation toward a purely declarative SVG filter. Each stage reduces computational cost and coupling to raster images.

1. **Per-parameter rasterization** (current default) — Full bitmap recomputed on every parameter change. Existing: `Filter` + `CompositeParts`.

2. **Polar coordinate indirection** — Decouple shape geometry from the optical transfer function. Compute a single "polar field" image encoding (angle, distance-to-border) per shape, then apply the 1D displacement lookup via SVG filter math (`feComponentTransfer` table + trig via `feColorMatrix`). The shape image is reused across optical parameter changes, reducing recomputation. Existing starting point: `FilterPolar` + `polar-distance-map.ts`. Could further reuse a single high-resolution polar field scaled down per border-radius.

3. **`objectBoundingBox` filter units** — Eliminate `ResizeObserver` by using relative (percentage-based) filter coordinates so the filter auto-scales with the element. Existing: `FilterOBB` + `CompositeImage`. Orthogonal to stages 2 and 4; can be combined with either.

4. **Fully procedural SVG filter** — Compute the distance field, displacement, and specular entirely within the SVG filter graph (e.g., turbulence, lighting, morphology primitives). No raster images at all. This would make the filter resolution-independent and applicable to arbitrary shapes, not just rounded rectangles.

## Tooling Notes

- Linting uses **oxlint**, not ESLint. The config is in `.oxlintrc.json`.
- Type checking uses **tsgo** (native TypeScript preview), not `tsc`.
- Build uses **Vite 8** with **Rolldown** bundler and `rolldown-plugin-dts` for type declarations.
- React Compiler (babel-plugin-react-compiler) is enabled for build optimization.
- Storybook 10 with `@storybook/react-vite` framework; stories are in `stories/`.
