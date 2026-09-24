# Evaluation assets

- `cases/` owns reusable domain/source truth and interviewee-visible inputs.
- `protocols/` owns prompts, runners, and procedures that are still supported.
- `oracles/` owns reviewed expected claims and answer keys; keep them outside interviewee and model inputs.
- Local run output, traces, profiles, transcripts and logs belong under
  `apps/brunch-agent/.data-wipe-me/evaluations/`, not the tracked tree.
- Never overwrite an explicitly promoted benchmark artifact or test fixture.
  Local run directories are disposable.
- Tests must use test-only output paths.
- Do not write complete run bundles into `docs/evidence/`.
