# ADR-0004: In-Petrinaut demo staging and the brunch-agent monorepo import

Date: 2026-08-18
Status: accepted
Amended: 2026-08-20 by FE-1437 (package family and imported application charter);
2026-08-21 by FE-1437 (Brunch context root)
Supersedes: the demo-shell recommendation in
[recommendation-demo-vehicle](../planning/process-model-elicitation/recommendation-demo-vehicle.md)
(FE-1362's resolution); amends ADR-0002's rule N3
Decided on: the 2026-08-18 integration meeting (Dei, Chris, Lu); recorded on FE-1433

## Context

The demo-vehicle recommendation (FE-1362, the September demo staging decision) proposed a
one-off demo shell consuming the elicitation and Petrinaut libraries, meeting at the artifact
boundary. The 2026-08-18 integration meeting decided otherwise: the desired staging is
**integration into demo.petrinaut.org** (`apps/petrinaut-website` in `hashintel/hash`) — the
product view being that the existing implementation surface should be extended rather than
paralleled.

A re-assessment against the Petrinaut survey (FE-1358, the read-only architecture audit)
found the topology viable without changes to the Petrinaut chat panel: the panel's
`aiAssistant` prop takes a host-supplied `ChatTransport`, wraps it with its own decorators, and
executes tool calls client-side against the live editor. What Petrinaut lacks — a server-side
home for a stateful agent loop with durable persistence — is exactly what the elicitor server
is. The meeting also settled the library's name and destination: `@hashintel/brunch-agent`,
imported with git history into the `hashintel/hash` monorepo as a native workspace alongside
`@hashintel/petrinaut`. The review and spike gates for that import are now satisfied.

## Decision

1. **Staging**: the September demo runs inside demo.petrinaut.org. The elicitor is a **remote
   server** the site's chat panel addresses through the `aiAssistant` transport; the site's
   stock `/api/chat` proxy and `petrinautAiPrompt` are bypassed entirely for brunch sessions.
2. **Identity of the package family**: `@hashintel/brunch-agent` is the harness package, imported
   into `hashintel/hash` with git history preserved and accompanied by the independently installable
   `@hashintel/brunch-agent-binding-flue`, `@hashintel/brunch-agent-transport-aisdk`, and
   `@hashintel/brunch-agent-plugin-gherkin` packages. All four are private through the import and
   live under `libs/@hashintel/brunch-agent/packages/`, with the harness implementation in
   `packages/core`; the harness does not re-export its extensions.
3. **Boundary discipline** (the rule the monorepo makes easy to erode): `@hashintel/petrinaut`
   stays elicitor-agnostic; `@hashintel/brunch-agent` stays renderer-agnostic;
   **`apps/petrinaut-website` is their compile-time meeting point**. The `apps/brunch-agent`
   server remains Petrinaut-independent and meets the website only through the AI SDK/HTTP
   transport. Any Petrinaut-library change brunch needs is made as a generic host extension (e.g.
   host-supplied client-tool handlers on the `aiAssistant` prop), never as brunch-specific
   code in the library.
4. **Session identity**: the principal lives in the ui shell, per spec §4 — a
   localStorage-stored random UID sent on the transport for the demo site; HASH's Ory identity
   later. The elicitor server resolves principal → session set; the harness stays
   principal-free (keyed by session id), with an opaque owner key at the storage port for
   store-level refusal of cross-principal access.
5. **N3 amended**: ADR-0002's "the demo shell is `apps/demo`" is retired — there is no demo
   shell. The imported `apps/brunch-agent` re-charters `apps/dev` as the remote Brunch server,
   carrying forward its target-gallery and diagnostics charter as internal operational roles. The
   September user-facing application is `apps/petrinaut-website`.
6. **Context locality**: `libs/@hashintel/brunch-agent/` is the Brunch context and agent-session
   root. It owns the domain glossary, decisions, guidance, planning records, and the four child
   package workspaces. It is not a package-manager root and carries no package manifest, lockfile,
   or competing toolchain. `apps/brunch-agent` remains at HASH's application root and points back
   to this context authority.

The artifact boundary (versioned net file + scenario through `parseSDCPNFile`) remains the
inter-library contract and the "it's just a file" demo beat; what this ADR changes is where the
elicitor is staged, not what it emits.

## Consequences

- FE-1362 re-resolves to this decision; FE-1333 (the integration-definition ticket) closes on
  this ADR; FE-1331 (start elicitation from create-new-net) is un-deferred — in-Petrinaut
  initiation is now the September topology, not the post-September one.
- The integration build was specified on FE-1433
  ([petrinaut-integration-spec](../planning/process-model-elicitation/petrinaut-integration-spec.md)),
  and both gating spikes reported: Flue turn suspension carries client-tool round-trips, and the
  Pi-to-AI-SDK stream adapter drives Petrinaut's panel.
- The review stack and spikes have landed. FE-1437 records the final standalone SHA and imports
  that history; from that point unfinished work continues only in `hashintel/hash`.
- Grouping the package family under one context root preserves one glossary and one agent operating
  surface without recreating the standalone Bun workspace.
- The Flue server's deployment home is an open question owned with infra (Postgres exists;
  deployment is unblocked by the import decision — the code will live in `hashintel/hash`).
- FE-1433 applied the transport and suspension amendments. FE-1437 explicitly amends §12.2 and
  §12.5 for the imported package family and application charter.
