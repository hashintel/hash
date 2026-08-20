import { defineConfig } from 'vite';

/**
 * The client build — a second, plain Vite build alongside the Flue one.
 *
 * `@flue/vite` forces `build.ssr` with its own fixed inputs, so the main build
 * emits the server and nothing else: `index.html` and everything it pulls in
 * are never transformed by it. Without this config the ui tree has no build
 * coverage at all, and a client-side break stays invisible until someone opens
 * the page in `vite dev`.
 *
 * Deliberately not the flue plugin: in dev the flue controller owns the whole
 * request space and serves the ui itself, so this config exists only to
 * produce — and thereby typecheck-and-bundle — the production client.
 */
export default defineConfig({
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    // Referenced by app.ts when serving the built ui; a hashed filename would
    // have to be looked up through the manifest for no gain at this size.
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
