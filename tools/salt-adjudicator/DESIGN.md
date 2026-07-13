# SALT swipe adjudicator design

## Direction

The physical scene is a late-night annotation bench: one person working in low
ambient light, making many careful decisions without visual fatigue. The visual
lane combines Raycast's keyboard fluency, Bloomberg's compact readouts, and
Ableton's unambiguous control states.

The color strategy is restrained. Near-black neutral surfaces dominate;
cobalt is the instrument accent; the four geometry colors appear only where
they encode a decision, distribution, or edge response.

## Color

All authored colors use OKLCH.

```css
:root {
  --color-bg: oklch(0.075 0 0);
  --color-surface-1: oklch(0.12 0.006 260);
  --color-surface-2: oklch(0.17 0.008 260);
  --color-surface-3: oklch(0.22 0.01 260);
  --color-border: oklch(0.31 0.012 260);
  --color-border-strong: oklch(0.43 0.018 260);
  --color-ink: oklch(0.93 0.008 260);
  --color-muted: oklch(0.72 0.014 260);
  --color-faint: oklch(0.58 0.014 260);
  --color-primary: oklch(0.69 0.14 260);
  --color-primary-fill: oklch(0.47 0.14 260);
  --color-focus: oklch(0.76 0.15 260);
  --color-coincident: oklch(0.78 0.13 180);
  --color-proximal: oklch(0.72 0.15 260);
  --color-overlay: oklch(0.8 0.14 80);
  --color-unclear: oklch(0.73 0.14 330);
  --color-danger: oklch(0.68 0.17 25);
  --color-warning: oklch(0.8 0.14 80);
  --color-success: oklch(0.78 0.13 180);
}
```

Class colors always appear with a class name, initial, direction, pattern, or
position. Large fills remain neutral. Dark-mode depth comes from progressively
lighter opaque surfaces, not decorative shadows or glass.

## Typography

Use only locally available system monospace faces:

```css
font-family:
  ui-monospace, "SFMono-Regular", "Cascadia Code", "Roboto Mono", Menlo,
  Consolas, monospace;
```

No font request may leave the document. The fixed product scale is 0.75rem,
0.875rem, 1rem, 1.125rem, and 1.25rem. Relation text is 1.0625rem with a 1.62
line-height on desktop and never below 1rem. Labels use medium or semibold
weight; readouts use tabular numerals; code-like content disables ligatures.

## Spacing and shape

Use a 4px-derived spacing scale: 4, 8, 12, 16, 24, 32, 48, and 64px. Related
controls sit 8–12px apart; major regions separate by 24–48px. Corners are
instrument-tight: 2px for readouts, 4px for controls, and 6px for the relation
surface. Borders are full-perimeter 1px hairlines.

## Layout

During swiping, a compact top rail carries study identity and session status, a
large centered relation document owns the viewport, four labeled decision zones
occupy the cardinal edges, and a bottom rail carries secondary actions. The
document follows the atlas card hierarchy: relation and description first,
source-to-target types as the semantic axis, examples as primary evidence, then
constraints, ancestors, aliases, and additional context. Long taxonomy lists
show four entries before an inline native disclosure; card metadata remains
sticky while the document scrolls. Notes open inline beneath the card and do
not cover it.

Setup, progress, merge, adjudication, and study-building views use a bounded
two-column instrument layout where useful. They collapse to one column before
content becomes cramped. On coarse pointers, decision zones become explicit
44px-or-larger buttons around the card. Vertical pans scroll long relation
documents; horizontal swipe gestures remain available for Overlay and
Proximal.

The coordinator builder is a five-step instrument flow: source import,
qualification-anchor curation, production planning, final review, and bundle
handoff. Its step rail stays compact and textual. Anchor curation pairs a
paginated/searchable pool list with one full relation preview and a required
class-and-rationale editor. Planning keeps inputs and the live `N/n/M/m`
readout in one view; metrics use tabular numerals, full labels, and a restrained
cobalt boundary rather than decorative charts. At narrow widths the browser,
preview, editor, and readouts stack in task order without hiding controls.

## Components and states

- Buttons, fields, tabs, drop zones, and decision zones define default, hover,
  focus-visible, active, disabled, loading, error, and success states.
- Focus uses a consistent 2px cobalt outline with a 2px offset.
- Errors sit next to the field or import that caused them and state how to
  recover.
- Persistence and not-yet-exported counts are always textual, never color-only.
- Geometry class controls expose a short operational definition on hover and
  keyboard focus. A dedicated class guide provides the same definitions for
  touch users and pauses decision timing while open.
- Empty states explain the next concrete action and accept drag-and-drop plus a
  visible file-picker alternative.
- Builder plans expose infeasible constraints inline, announce recalculated
  coverage and time through an `aria-live` readout, and never use color alone
  for qualification classes or warnings.
- Qualification card text is always read-only. A selected answer and rationale
  are visibly editable, removable, and summarized by textual per-class counts.
- Historical distributions are withheld while a pass is active.

## Motion

Motion communicates a decision and then gets out of the way:

- key/button acknowledgement: 70–90ms;
- card decision exit: at most 120ms;
- panel or inline note reveal: 160–180ms;
- easing: `cubic-bezier(0.22, 1, 0.36, 1)`.

Card exits use bounded transform and opacity. The next card is already prepared
before the exit begins. Reduced motion replaces translation with an immediate
crossfade and never delays input.

## North-star composition

The approved direction keeps the swipe view free of a sidebar. The relation
document is a readable semantic specimen rather than a raw preformatted dump
or conventional dashboard card. Decision labels remain visible at the four
edges, metadata is compressed into the top rail, and flag/note/undo/export
remain in the bottom rail. Mobile stacks the source-to-target axis and evidence
sections while retaining thumb-sized edge controls.
