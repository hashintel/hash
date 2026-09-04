# Retire Mission 4 proof-of-life v1 and cut v2

Date: 2026-09-03

Status: **owner accepted the v2 repair direction; v2 freeze and paid execution remain pending.**

## Observation

Both authorized Vestera v1 attempts reached the production Brunch `ChatAgent`, settled normally, and retained canonical Flue history. Each trace showed successful `sdcpn-modelling` activation, then successful `elicitation` activation, then the conditional SDCPN profile read before assistant text. Each assistant text asked only what scheduling decision the simulation should support. The fresh Opus adjudicator classified both texts as Orientation, so neither attempt contained a first Substantive text or satisfied the interactive proof floor.

In both attempts the GPT-5.6 persona stopped after one visible submission and reported that Brunch had asked its first substantive operational question. The replacement did so even though Brunch called its own question “one orienting question.” Inspection of the exact Pi session records found no transport or extension stop signal: `brunch_turn` returned only Brunch's exact text, and the persona produced the stop report itself.

## Cause

The v1 probe objective told the persona to stop immediately after the first “Substantive operational question.” The persona's isolated context intentionally excluded the accepted ruler and contained no definition of Orientation or Substantive. V1 therefore delegated an evaluator-owned semantic classification to a model that the protocol simultaneously declared was not the oracle. The strongly terminal wording turned the persona's unsupported classification into a premature stop.

This is an instrument defect, not evidence of Brunch activation or restraint failure. It entered with the original v1 protocol at `69e75ea363` and is not inherited from `SYSTEM.md`, `brunch_turn`, or another template.

## Decision

Retain the complete v1 instrument, primary, replacement, and adjudications as immutable informative failure evidence. Do not admit Data Centre or later v1 slots and do not reuse any v1 attempt id.

Cut v2 with the same cases, production elicitor text, models, host, ordering, replacement rule, evidence mechanism, full-run objective, hard logical ceilings, and ruler semantics. Give each slot fresh `m4-pol-v2-*` attempt ids. Create a v2 ruler whose only change describes the new probe extent. Replace only the two interactive-probe stop conditions with an exact three-visible-submission bound: the persona sends the opening and two natural continuations unless the tool reports a genuine orchestration error. The fresh adjudicator alone locates the first Substantive text after settlement. Later retained turns cannot alter the activation and read ordering before that text.

The initial v2 preparation retained the cumulative v1-plus-v2 $10 USD ceiling rather than granting a second allowance, recomputed the estimate, and left missing v1 Sonnet usage unreconciled rather than replacing it with an unexplained reserve or zero. The owner subsequently suspended currency gating for v2 in a separate decision. Bind the complete exact objective in the v2 instrument manifest and a SHA-256 regression check, and obtain fresh owner acceptance of the v2 manifest before any v2 model call.
