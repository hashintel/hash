# Brunch agent application

This application belongs to the Brunch context rooted at
`../../libs/@hashintel/brunch-agent/`. Read that context's `CLAUDE.md`, `CONTEXT.md`, and relevant
ADRs before changing this application. HASH root guidance takes precedence.

The application composes the Brunch packages, Flue runtime, HTTP routes, and local diagnostics. It
must remain independent of Petrinaut implementation packages; `apps/petrinaut-website` meets it
through the AI SDK/HTTP transport.
