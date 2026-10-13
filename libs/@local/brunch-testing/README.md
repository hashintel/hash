# Brunch testing

Test harness for the built Brunch server (`apps/brunch-agent`), shared by its own integration tests and evaluations and by the Petrinaut website's integration tests. Unpublished and test-only.

- `@local/brunch-testing/load-built-application`: `loadBuiltBrunchApplication` imports `apps/brunch-agent/dist/app.mjs` in-process. Run `@apps/brunch-agent#build` first; a consumer's `turbo.json` declares that edge.
- `@local/brunch-testing/admission-controls`: `runAdmissionControls` runs the admission-controls probe against the built server in a child process and returns its parsed result.
- `@local/brunch-testing/admission-voice-evidence`: the Voice-facing slice of that result.
- `@local/brunch-testing/run-node-script`: `runNodeScript` spawns a TypeScript file under `node --experimental-strip-types`.

Provider doubles live in `@local/pi-faux-providers`.
