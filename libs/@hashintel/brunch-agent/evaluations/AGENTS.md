# Evaluation assets

- `cases/` owns reusable domain/source truth and interviewee-visible inputs.
- `protocols/` owns prompts, runners, and procedures.
- `oracles/` owns reviewed expected claims and answer keys; keep them outside interviewee and model inputs.
- Generated or observed run evidence belongs under `docs/evidence/evaluations/`, not here.
- Preserve provenance; never silently overwrite immutable snapshots.
- Tests must use test-only output paths.
