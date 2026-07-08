---
description: "Review guidance for Rust changes"
applyTo: "**/*.rs"
excludeAgent: "coding-agent"
---

# Rust Review Rules

This workspace uses **Rust edition 2024** on nightly, with `clippy` (warnings denied) and `rustfmt` in CI. All merged and pushed code compiles. These are Rust semantics that past reviews have repeatedly gotten wrong — do not flag any of the following as errors:

## Language semantics reviewers commonly get wrong

- **Edition 2024 prelude**: `Future` and `IntoFuture` are in the prelude. Do not claim they (or other prelude items) are missing imports.
- Functional record update (`Self { ..*self }` through `&self`) does NOT require the struct to be `Copy`. It moves/copies field-by-field; it compiles whenever every remaining field is `Copy`.
- `==` desugars to `PartialEq::eq(&a, &b)` — comparing fields through a reference moves nothing. Likewise, matching on a non-`Copy` field by value is fine when the patterns only bind `Copy` data or wildcards.
- Partially moving one field while borrowing a different field of the same local is accepted — the borrow checker tracks fields independently.
- A trait impl may return a longer lifetime than the trait declares (e.g. `&'static str` for `fn as_str(&self) -> &str`) — impl signatures are checked with subtyping.
- Adapters that take `self` by value (e.g. `Rng::sample_iter`) work on immutable bindings. Check whether a method takes `self`, `&self`, or `&mut self` before claiming a binding must be `mut`.
- The standard library implements arithmetic between integers and `NonZero` types (e.g. `usize / NonZero<usize>`).
- Block expressions in statement position (`unsafe { ... }`, `if`, `match`, `loop`) do NOT need a trailing semicolon.
- `str::strip_prefix`, `trim_matches`, and friends accept any `Pattern`, which includes `char` arrays/slices like `['n', 'N']`.

If a comment of yours depends on the borrow checker, trait resolution, or the prelude rejecting code that is sitting in the diff with green CI, the comment is wrong — discard it.

## Project conventions

- Error handling uses `error-stack` (`Report`, `ReportSink`, `.change_context()`); suggest alternatives only within that framework.
- Doc comments use intra-doc links; only flag a doc link if it points at a genuinely different item than the one being documented, not a re-export or moved path.
- Prefer suggesting `cargo` tooling the repo uses: `cargo nextest run --package <name>`, `cargo clippy --all-features --package <name>`.

## What is worth flagging in Rust code here

- SQL built in Rust: missing `WHERE` conditions (e.g. draft/permission filters), missing `ORDER BY` when order feeds a deterministic contract, mispaired `unnest` arrays.
- Serialization boundaries: values that serialize successfully in tests but fail on real data (e.g. `serde_json` rejects `NaN`/infinite floats), error types whose serialized form leaks internal or user data to clients.
- Authorization: code paths that could return or leak data the actor cannot view.
- Unbounded allocation or CPU driven by user-controlled request parameters.
- Panics reachable from request handlers (`unwrap`, `expect`, indexing) on untrusted input.
