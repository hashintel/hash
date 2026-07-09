# Type icons

SVG icons for entity types served as static assets from this folder.

## Every icon must declare explicit `width` and `height`

The root `<svg>` element of each icon **must** carry explicit `width` and
`height` attributes, not just a `viewBox`. When vendoring in new icons (for
example from FontAwesome, which ships `viewBox`-only SVGs), add `width` and
`height` matching the `viewBox` dimensions before committing.

```svg
<!-- Not acceptable: viewBox only, no intrinsic size -->
<svg viewBox="0 0 512 512">…</svg>

<!-- Acceptable: explicit dimensions matching the viewBox -->
<svg width="512" height="512" viewBox="0 0 512 512">…</svg>
```

### Why

An SVG that declares only a `viewBox` has no _intrinsic_ size. CSS-based
consumers (a `mask`/`background-image`, or an inline `<svg>` sized by its
parent) cope with this fine because the size comes from the surrounding layout.

However, renderers that load an icon **by URL and rasterize it** — canvas/WebGL
texture pipelines, image-atlas loaders, server-side rasterizers, and similar —
often need the source image to have definite dimensions.

Declaring `width`/`height` makes an icon render correctly across **all** of
these consumers. The values only set the rasterization resolution and aspect
ratio of a vector, so matching the `viewBox` is both correct and lossless —
display size is still controlled by the consumer.
