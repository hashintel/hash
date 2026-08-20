# Recommendation: the September demo vehicle

**Ticket**: FE-1362 · **Formed**: 2026-08-12 · **Status**: Lu's settled position on the
wayfinder map (FE-1357) — the recommendation he brings to the integration discussion on
Tuesday 2026-08-18 (Dei, Chris, Lu; Kostandin back that week). Demo: 2026-09-17/18, ARIA
audience, format TBD.

This document is the integration doc FE-1333's done-when asks for, offered as a recommendation
for that discussion: it covers the boundary, where sessions persist, and where the elicitor
runs. Build-approach statements within it (how the elicitation library is built) are within the
dev remit and stated as such; the integration posture and anything touching product shape are
recommendations until discussed.

## The recommendation

Build the September demo as a **one-off demo shell**: a purpose-built, explicitly disposable
application that consumes **two libraries** —

1. the **elicitation library** — greenfield, built to the elicitation-kernel spec
   (`docs/planning/elicitation-kernel/spec.md`): harness + CPS plugin + Flue binding, scoped to
   a demo-critical slice, scavenging existing brunch surfaces opportunistically. The existing
   brunch app is **not** the base.
2. the **Petrinaut libraries** — the published React UI + headless `petrinaut-core`, consumed
   as-is, client-side.

Neither library consumes the other. They meet at the **artifact boundary**: the elicitor emits
a versioned net file **plus a `scenario`** (nets carry no marking or timing — without a
scenario the net is dead), and Petrinaut consumes it through its production parser /
import-with-autolayout path.

## Handoff mechanics on stage

- Default beat: **in-process handoff** through the real serialize → parse path — seamless, but
  the boundary crossed is the real one.
- One deliberate **"and it's just a file"** moment: save the artifact, open it in stock
  Petrinaut. That is the decoupling claim made visible.
- The payoff shot is the net **running**: the elicited scenario animating the token game. A
  rendered-but-dead net undercuts the "the interview produced a working model" narrative.

## Runtime and persistence (FE-1333 coverage)

- The **elicitor runs server-side** in the demo shell, on the Flue substrate (as the
  `prototype/10-flue-roundtrip` walking skeleton already does).
- **Sessions persist in the demo shell's storage**: capture store + session-log archive behind
  the kernel spec's storage port.
- Petrinaut's libraries are **purely client-side** — rendering and simulating the artifact,
  with zero persistence responsibilities.
- Deployment and storage specifics remain open (map fog), judged low-difficulty.

## Demo-critical set (demo-legibility test)

Demo-critical, in narrative order: **(a) durable capture with provenance** (quoted evidence
spans), **(b) completion accounting** (the elicitor knows what it still lacks), **(c) the live
interpretation-render panel** — the display surface through which the audience *sees* (a) and
(b) happening — and **(d) the artifact handoff into Petrinaut, running**. These are precisely
what the incumbent in-Petrinaut assistant cannot do: the differentiation narrative is "what a
prompt-in-a-panel cannot do."

**Voice is conditional**: a nice-to-have considered only if (a)–(d) are very solid with
significant time to spare (then T0 push-to-talk floor, T2 live-extraction target, per
FE-1359's tiers). Note: even the *prospect* of voice argues for the demo-shell topology —
voice bolts on at the ui/turn shell, which is only ours to modify if we own the shell.

## Evidence topology (carry into Tuesday 2026-08-18)

1. **Petrinaut survey** (FE-1358, `research/petrinaut-survey.md`): the artifact boundary
   already exists in production — versioned file format, pure parser, import-with-autolayout
   (Import currently hidden in HASH's embed: a small unhide ask to the Petrinaut team). The
   incumbent assistant is browser-resident with no headless path, no queue, and no provenance
   capture anywhere in the stack.
2. **Chris (Petrinaut lead), on FE-1333**: supports circumspection about coupling; confirms
   both elements are libraries meant to be consumed by applications; expects HASH to consume
   both in the end — "Petrinaut should not do the instantiation of Brunch directly."
3. **Standing preference**: decoupling unless evidence forces coupling — no evidence does; the
   demo-legibility test *favors* the boundary (the handoff is a beat, not a seam to hide).
4. **Voice tractability** (FE-1359): the bolt-on seam only exists in a shell we own.
5. **The "entirely new" stance** (grilling round 1) plus the differentiation narrative: the
   demo's claims are exactly the kernel spec's machinery and exactly what the incumbent lacks.

## Positions on in-flight issues

| Issue | Position |
| --- | --- |
| FE-1328 (extract the elicitation core) | **Build approach (dev remit).** The deliverable stands — an importable elicitation core with no server/DB/UI deps — but "extraction" is figurative: the core is rebuilt greenfield by abstraction and extension per the kernel spec. Literal extraction would import brunch's design debt and gaps. |
| FE-1329 (make the brunch elicitor generic) | **Build approach (dev remit).** Genericity arrives via the harness/plugin split — the CPS plugin is a thin shell over a generic harness — not by retrofitting brunch. |
| FE-1331 (start elicitation from create-new-net) | **Recommend deferring** — the demo-shell recommendation contradicts it for September; in-Petrinaut initiation is the natural post-September consumer topology (once HASH consumes both libraries, per Chris's framing). Deferred, not rejected; product call stays with the PM side. |
| FE-1333 (define the integration) | **Answered by this document as the recommended position**; stays open for Tuesday's discussion. |
| Dora's PRO-98 claim #5 (in-Petrinaut one-shot-then-iterate initiation) | **Recommend against for September** — under this recommendation, session initiation happens in the demo shell. Recommendation with reasons delivered as a comment on PRO-98 (2026-08-12). |

## Left open (map fog)

- **Package naming**: `brunch-lite` / `brunch-core` are interim candidates; a post-September
  step could fold back into `brunch` proper as a monorepo with the harness as a sub-path
  package. Not important now.
- **Deployment & storage specifics** for the demo shell (remote/sandbox story).
