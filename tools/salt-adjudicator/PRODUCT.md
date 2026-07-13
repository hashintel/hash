# Product

## Register

product

## Platform

web

## Users

The primary users are annotators completing short, focused geometry-labeling
sessions at a laptop, with keyboard input as the fastest path and touch as a
supported fallback. Coordinators prepare balanced study bundles and reconcile
exports. Adjudicators resolve the highest-entropy relations after independent
annotation is complete.

## Product Purpose

SALT turns relation cards into reproducible raw human evidence without a
backend, account, or network dependency. It must make focused labeling fast,
keep previous judgments blind, survive a tab crash, and produce transparent
JSONL that can be merged and analyzed downstream.

Success means a coordinator can distribute one study-specific HTML file plus a
short code to each annotator, receive valid exports, verify assignment coverage,
and produce an adjudicated edge-case table without operating any service.

## Positioning

One offline artifact carries the study, preserves independent evidence, and
makes every assignment and shuffle reproducible.

## Brand Personality

Precise, quiet, and instrument-like. The interface should feel trustworthy
during repetitive, high-focus work: terse without being cryptic, dense without
being cramped, and polished without becoming decorative.

## Anti-references

Do not resemble a gamified swipe app, a neon “hacker terminal,” or a generic
card-grid admin dashboard. Avoid streaks, scores, celebratory effects, sounds,
decorative data, large colored fills, and motion that delays the next decision.

## Design Principles

1. **The card is the interface.** During adjudication, everything else becomes
   quiet context around the relation text.
2. **Speed never obscures state.** Keyboard actions are immediate, but every
   label, flag, note, undo, and persistence state receives legible feedback.
3. **Blind by construction.** Historical labels do not enter the swipe view's
   rendered state.
4. **Evidence remains inspectable.** Seeds, hashes, assignments, retractions,
   rubric versions, and exports are explicit rather than hidden conventions.
5. **Offline is a real operating mode.** No essential path depends on a
   request, account, package install, or build step.

## Accessibility & Inclusion

Target WCAG 2.2 AA. Every action has a visible keyboard and pointer path, focus
is never hidden, class meaning is not conveyed by color alone, body text
respects browser font sizing and 200% zoom, touch targets are at least 44px,
and all state-changing motion has a reduced-motion alternative.
