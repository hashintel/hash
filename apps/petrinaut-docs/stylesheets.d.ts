/**
 * A component under `content/components` imports its stylesheet for the side
 * effect. The site's Vite resolves the file; this tells `lint:tsc` that such
 * an import names a module, so the check of every other side-effect import
 * stays on.
 */
declare module "*.css" {}
