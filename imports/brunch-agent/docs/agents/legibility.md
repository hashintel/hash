# Legibility protocol: render, read the strain, reconcile

How work arcs with significant agent-generated output close: produce legibility artifacts that
aid review and re-establish shared understanding between the humans and the agents carrying the
work. Companion to `documentation.md` (which governs where documents live; this file governs
how understanding is checked and kept).

The protocol serves one thesis, the same one the CI gates and the capture store serve in code:
**no claim without a way for it to fail.** A document read in its own register can nod along
with itself; re-rendered into a different register, every claim must survive translation, and
the places where it doesn't are findings.

## The move: render and read the strain

At the close of an arc, re-render its central artifact into another register and instruct the
renderer to report **every place the source resisted plain rendering** — a dangling referent, a
term defined nowhere, a prohibition citing nothing, a causal claim whose causality had to be
inferred. The strain report *is* the review yield; the rendering itself is a byproduct (often a
useful one — a teammate-readable account).

Run renderings as fork subagents carrying the strain-report instruction, so the main thread
reviews the findings instead of doing the translation. Instrumenting the collection raises the
yield: the ir-design plain rendering returned seven strain points where an uninstrumented
round-2 read of the FE-1374 spec renderings had found four by accident (each of which fed a
real spec change — the practice predates its name).

## The register dial

The register is a dial, not a single target. One practice, several grades — pick the cheapest
grade that can still fail:

- **Plain prose** (Google/GOV.UK style): the default. Catches undefined terms, uncited rules,
  compressed allusions.
- **STE grade** (controlled vocabulary, one instruction per sentence): for sources whose claims
  are dense or load-bearing enough that plain prose can still paper over them. Costs more;
  earns it when the source will govern implementation.
- **Worked examples** (FE-1397's form): re-render a *definition* into concrete instances and
  check what breaks. The strongest grade for type systems and contracts — a definition that
  survives three worked designs at different thicknesses has been tested, not admired.

## Filings are render-and-read material too

A sweep's own capture — its tickets, its accrual comments, its penciled directions — is itself
a rendering of the session's understanding, and gets the same treatment: expect a challenge
pass over the filings before the arc closes. The FE-1405/FE-1406 round came from re-reading the
first round's own text ("shapes-to-fill" quoted back); the gaps were real and had been deepened
by the filings meant to close them.

## Consolidation: capture-as-we-go, reconcile-before-landing

Capture channels (accrual comments, pencil lists, strain appendices, handoffs) guard against
evaporation, not fragmentation. Two rules keep the yield coherent:

- **Every capture channel names its consolidation target** — accruals reconcile into the
  convergence trace, pencils graduate to tickets or the trace, strain reports become doc fixes.
  A channel with no named target is a leak with a delay.
- **An arc is not closed until consolidation runs.** The closing step reconciles what the
  captures established into the durable artifacts (trace, docs, tickets) — a handoff note alone
  is a deferral, not a deposit.

## Deposit: work describes itself at authoring time

Prose backfill is remediation, not workflow. A branch's commit message and PR body carry its
semantics when it lands — the record must not abstain exactly where description is most needed
(FE-1390 landed 1,392 lines with an empty body; the deep-read that repaired it cost more than
writing it at authoring time would have). The same rule for tooling: a skill output written
into `docs/` passes through the documentation protocol — an `INDEX.md` row or an `AGENTS.md`
pointer — like any other document.

Reflections belong in work products, marked as `> **Reflection:**` blockquotes, distinct from
the captured facts — insight left only in chat evaporates with the context that produced it.
