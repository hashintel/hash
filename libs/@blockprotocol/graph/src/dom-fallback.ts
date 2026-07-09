/**
 * Minimal fallback declaration for the DOM global referenced in this package's
 * public API (`HTMLElement` in {@link GraphBlockHandler} / {@link GraphEmbedderHandler}).
 *
 * Browser consumers get the real type from `lib.dom` — this empty interface
 * merges with it and adds nothing. Node.js consumers (which type-check these
 * sources via the shared tsconfig `paths` aliases) don't include `lib.dom`,
 * so this keeps the package type-checkable without pulling the whole DOM lib
 * into their programs.
 *
 * TypeScript ≤ 5 got this for free: it auto-included every `node_modules/@types`
 * package, and `@types/react/global.d.ts` declares the same empty fallback
 * interface. TypeScript 6 only includes packages listed in `types`, so we
 * declare the fallback ourselves.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentional empty fallback, see above
  interface HTMLElement {}
}

export {};
