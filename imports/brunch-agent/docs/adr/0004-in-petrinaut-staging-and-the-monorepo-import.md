# ADR-0004: In-Petrinaut demo staging and the brunch-agent monorepo import

Date: 2026-08-18
Status: accepted
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
imported with git history into the `hashintel/hash` monorepo as a sibling of
`@hashintel/petrinaut`, once currently open PRs merge.

## Decision

1. **Staging**: the September demo runs inside demo.petrinaut.org. The elicitor is a **remote
   server** the site's chat panel addresses through the `aiAssistant` transport; the site's
   stock `/api/chat` proxy and `petrinautAiPrompt` are bypassed entirely for brunch sessions.
2. **Identity of the library**: `@hashintel/brunch-agent`, imported into `hashintel/hash` with
   git history preserved, sibling to `@hashintel/petrinaut`. `apps/petrinaut-website` is an
   application and may know about both libraries; this is not a mixing of concerns.
3. **Boundary discipline** (the rule the monorepo makes easy to erode): `@hashintel/petrinaut`
   stays elicitor-agnostic; `@hashintel/brunch-agent` stays renderer-agnostic; **applications
   are the only place the two may know about each other** (petrinaut-website now, the HASH app
   later). Any Petrinaut-library change brunch needs is made as a generic host extension (e.g.
   host-supplied client-tool handlers on the `aiAssistant` prop), never as brunch-specific
   code in the library.
4. **Session identity**: the principal lives in the ui shell, per spec §4 — a
   localStorage-stored random UID sent on the transport for the demo site; HASH's Ory identity
   later. The elicitor server resolves principal → session set; the harness stays
   principal-free (keyed by session id), with an opaque owner key at the storage port for
   store-level refusal of cross-principal access.
5. **N3 amended**: ADR-0002's "the demo shell is `apps/demo`" is retired — there is no demo
   shell. `apps/dev` remains the local development harness; the September demo host is
   `apps/petrinaut-website` in `hashintel/hash`.

The artifact boundary (versioned net file + scenario through `parseSDCPNFile`) remains the
inter-library contract and the "it's just a file" demo beat; what this ADR changes is where the
elicitor is staged, not what it emits.

## Consequences

- FE-1362 re-resolves to this decision; FE-1333 (the integration-definition ticket) closes on
  this ADR; FE-1331 (start elicitation from create-new-net) is un-deferred — in-Petrinaut
  initiation is now the September topology, not the post-September one.
- The integration build is specified on FE-1433
  ([petrinaut-integration-spec](../planning/process-model-elicitation/petrinaut-integration-spec.md)),
  gated by two spikes: Flue turn suspension carrying client-tool round-trips, and the
  Pi-to-AI-SDK stream adapter.
- The monorepo import happens after the currently open PRs merge and after the spikes report —
  harness-internal work continues in this repo and travels with the history import; only
  petrinaut-website wiring, Petrinaut-library extensions, and deployment integration wait for
  the move.
- The Flue server's deployment home is an open question owned with infra (Postgres exists;
  deployment is unblocked by the import decision — the code will live in `hashintel/hash`).
- The kernel spec amendments this decision implies (§12.2 package list, §9.6 owner key,
  §7.3/§7.4 batch-affordance question, §13 shipping shape) are applied as part of executing
  FE-1433, not silently.
