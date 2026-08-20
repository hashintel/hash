# Documentation protocol: ingest, settle, index

How documents enter this repo, where they end up, and how we prove nothing is lost. Companion
to `issue-tracker.md` (which governs issues; this file governs documents).

## Zones

| Zone | Role | Lifetime |
| --- | --- | --- |
| `docs/inbox/` | Untriaged arrivals: PDFs, exports, transcripts, pasted research. Timestamped filenames where the arrival date matters. | Temporary — everything here is awaiting settlement |
| `docs/planning/<effort>/` | All artifacts of an effort, active or complete: notes, research findings, maps, specs — nested by effort name. | Permanent (dispositioned at effort close) |
| `docs/reference/` | Settled documents of lasting value: external reports, transcripts, digested research. | Permanent |
| `docs/INDEX.md` | The TOC: one line per settled or in-flight document — title, date, one-line digest, provenance, where used. | Permanent, always current |
| `CONTEXT.md` | Glossary only (see domain-modeling discipline). | Permanent |

**Ephemera** live outside all zones: any directory named `drafts/` is git-ignored (root
`.gitignore`), for documents whose delivered form is the record — outbound comment and message
drafts, one-off prep. Place one inside the effort it serves (e.g.
`docs/planning/<effort>/notes/drafts/`). Never register drafts in `INDEX.md`, and never link a
`drafts/` path from Linear or a committed document — once delivered, link the destination
(the posted comment, the sent message) instead.

External stores (Linear, Notion) hold *pointers and mirrors*, never the only copy: Linear issue
descriptions gist and link; Notion pages that originate content (e.g. team-facing question docs)
are listed in `INDEX.md` with their URL.

## The ingest protocol

1. **Arrive**: new material lands in `docs/inbox/` (timestamped name if the date matters).
2. **Register**: the first time a document is *used* (read into an effort, cited by a ticket),
   add its line to `docs/INDEX.md` with status `inbox`.
3. **Settle**: move it to its permanent home (`docs/reference/` for external/source material;
   `docs/planning/<effort>/` if it is a working artifact of that effort), update its `INDEX.md`
   line (new path, status `settled`), and fix any links that pointed at the inbox path.
4. **Sweep**: at every effort boundary (map charted, map closed), empty the inbox — everything
   either settles or is deleted *with its INDEX line recording the deletion and reason*.

## Effort completion

When an effort closes, its `docs/planning/<effort>/` directory is reviewed file-by-file and
the review recorded in `INDEX.md`: tracker records (map, tickets) are mirrored to Linear if
not already there; everything else stays in place with status `settled`. (`.scratch/` was
retired 2026-08-12 — efforts live under `docs/planning/` from birth.)

**Nothing is deleted until its `INDEX.md` line records the disposition.** Linear mirrors gist
and link; the repo copy is canonical, so a repo path referenced from Linear must never be
deleted without updating the Linear reference.
