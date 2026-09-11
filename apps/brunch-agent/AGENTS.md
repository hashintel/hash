# Brunch agent application

This application belongs to the Brunch context rooted at
`../../libs/@hashintel/brunch-agent/`. Read that context's `AGENTS.md` and current `MISSION.md`
before changing this application. If `MISSION.next.md` exists, it is a scratchpad for later
concerns and is not execution authority. Consult `CONTEXT.md` or historical design documents only when a
concrete question requires them; ADRs and specs are hypotheses, not implementation obligations.
HASH root guidance takes precedence.

The application composes the Flue runtime, HTTP routes, and the Brunch packages required by the
current mission. It must remain independent of Petrinaut UI (`@hashintel/petrinaut`); it may import
published catalogs from `@hashintel/petrinaut-core` (for example user-guide page ids the panel
already executes). `apps/petrinaut-website` meets the editor through the AI SDK/HTTP transport.

`@earendil-works/pi-ai@0.83.0` is patched at the repo root so Anthropic
`input_schema` keeps the published tool JSON Schema. Pi's adapter still
collapses parameters to `{ type, properties, required }` by design; Brunch
construction tools need the full schema on the wire, independent of
constrained sampling. `@flue/runtime` depends on `pi-ai@^0.83.0`, which is
why the caret resolution exists. Re-evaluate the patch on any `pi-ai`
upgrade. Do not treat it as a general Pi behavior change.
