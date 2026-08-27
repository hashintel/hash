# Brunch agent application

This application belongs to the Brunch context rooted at
`../../libs/@hashintel/brunch-agent/`. Read that context's `AGENTS.md` and current `MISSION.md`
before changing this application. Consult `CONTEXT.md` or historical design documents only when a
concrete question requires them; ADRs and specs are hypotheses, not implementation obligations.
HASH root guidance takes precedence.

The application composes the Flue runtime, HTTP routes, and the Brunch packages required by the
current mission. It must remain independent of Petrinaut UI (`@hashintel/petrinaut`); it may import
published catalogs from `@hashintel/petrinaut-core` (for example user-guide page ids the panel
already executes). `apps/petrinaut-website` meets the editor through the AI SDK/HTTP transport.
