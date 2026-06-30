/**
 * `graphology-layout-forceatlas2` ships its single-iteration primitive as a
 * subpath module (`/iterate`) with no bundled type declaration. We drive it
 * DIRECTLY -- one iteration per scheduler step over flat Float32Array matrices we
 * build and own (rather than the blocking batch `forceAtlas2(graph, n)`, which
 * can't stream) -- so we declare just the call shape we use. The matrices are the
 * library's documented layout: PPN=10 floats per node, PPE=3 per edge.
 *
 * This file stays a SCRIPT (no top-level import) so `declare module` shims the
 * untyped subpath as an ambient module; the cross-package type reference therefore
 * uses an inline `import(...)`, and the export mirrors the package's CommonJS
 * `module.exports =` (so `import iterate from ".../iterate"` works under
 * esModuleInterop).
 */
declare module "graphology-layout-forceatlas2/iterate" {
  const iterate: (
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    options: import("graphology-layout-forceatlas2").ForceAtlas2Settings,
    nodeMatrix: Float32Array,
    edgeMatrix: Float32Array,
  ) => unknown;
  export = iterate;
}
