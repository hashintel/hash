# Findings — Yannis/Dora/Lu meeting, 2026-08-11

Source: [transcript](../../../reference/yannis-dora-lu-transcript-2026-08-11.md). Prep doc:
[expert-meeting-prep-2026-08-11](expert-meeting-prep-2026-08-11.md). Participants: Lu, Yannis
Zachos (Petrinaut team), Dora Ma (PM, "Speaker 4").

## Facts established (map-shaping)

1. **There is no in-house expert-interviewing practice to elicit from.** Yannis's modelling
   method is literature review + the Petrinaut AI assistant + Claude prompt
   reverse-engineering; even at the Clarion engagement "we didn't actually do any pattern
   elicitation." The prep questions (first-five-questions, dependency order, motif catalogue,
   completeness checks) remain unanswered — and the person expected to answer them says
   Claude's answers would be as good as his. Consequence: elicitation-strategy content must be
   sourced from literature + experiment, not internal expertise. PRO-98's checklist has no
   in-house oracle.
2. **The SDCPN-as-hypothesis stance is now shared, on the record.** Dora: "I also don't know
   if it should always be an STCPN. Sometimes it might be an SPN or a CPN if that is the best
   way to model something." Lu (unrebutted): "We're poor on things that showcase STCPNs as
   such… building that kind of a model is actually pretty sophisticated." The PRO-99
   "showcase SDCPN features" criterion vs. the use-case pool tension is aired.
3. **Net-as-projection got independent confirmation.** Yannis, unprompted, enumerated
   elicitable content with no net home: conservation-law constraints, business
   logic/regulatory constraints ("we wouldn't want to simulate behaviors that are strictly
   prohibited"), theoretical-vs-actual process (manuals vs. event logs — a
   conformance/compliance framing), data feeds.
4. **The incumbent baseline is a live product question.** Yannis's opening challenge:
   "there's already an AI assistant within Petrinaut doing what you're describing." Lu's
   positioning answer (preserve for roadmap narrative): the assistant asks *for a net* —
   collapsing elicitation into representation; the elicitor works upstream of the formalism
   and projects later. Dora's proposal: run the control — see what vanilla Claude/Petrinaut
   AI achieves on an elicitation-shaped prompt, and "fill any missing gaps rather than doing
   it from scratch."
5. **Architecture-for-iteration is a stated requirement.** Dora: "can we build an architecture
   whereby we can update the way the elicitor asks these questions easily, rather than
   committing from the get-go?" Lu: yes. (Direct validation of the pack/plugin +
   hash-pinned-directive design.)

## Ideas surfaced (ticket/fog seeds)

- **Priming from documents before questioning** (Yannis + Lu): ingest brochures, org charts,
  even facts about the interviewee; "squeeze the most out of what we've got without asking
  questions"; then ask fewer, more consequential questions. Elevates FE-1337-adjacent
  ingestion from post-Sept garnish toward demo-relevant strategy.
- **Confidence-directed questioning** (Yannis): maintain an under-the-hood representation
  with per-part confidence; question where confidence is lowest. (Echoes the kernel's
  issue/epistemic-status machinery.)
- **Question-tree / MoE lines-of-questioning with pruning** (Yannis) — Lu's caveat: real
  interviews don't strictly tree; early questions are open-ended; branches map poorly.
- **Question batching UX** (Dora, citing Nora's Zulip feedback): batch 3–4 questions, think
  ahead while the user answers; Lu's **horizon problem** caveat: batched questions go stale
  once earlier answers deviate — batch small, prefer independent questions. (Kernel spec's
  questionnaire-chaining §7.2 anticipated this; staleness is new design input.)
- **Capture the one-shot's assumptions** (Dora): even a one-shot net generation should have
  its assumptions extracted and stored as a graph to build on.
- **Average/best/worst-day questioning** (Lu+Yannis, converged): "describe a bad day / what
  keeps you up at night" reaches black-swan knowledge that exists only in heads, not event
  logs; escalate to constructed hypothetical scenarios when the person isn't forthcoming.
- **The evaluation problem, re-aired** (Lu+Dora): honest elicitations are slow, generative at
  every step, non-repeatable (same person answers differently by the hour) — comparisons need
  a proxy. (The kernel spec's testing strategy — model-as-offline-respondent, frozen replay
  fixtures, mutation library — is the existing candidate answer; feeds PRO-104.)

## Commitments made in the meeting

- Lu: write this up and "produce something that indicates the next questions" (= the map).
- Lu: put up a Notion doc with the prepared questions for Yannis to answer/comment async.
