---
applyTo: "**/*.rs"
excludeAgent: "coding-agent"
---

# Rust Review Rules

This repository uses nightly Rust with `clippy` (warnings denied) in CI. All merged and pushed code compiles. These are Rust semantics that past reviews have repeatedly gotten wrong — do not flag any of the following as errors:

## Language semantics reviewers commonly get wrong

- Functional record update (`Self { ..*self }` through `&self`) does NOT require the struct to be `Copy`. It moves/copies field-by-field; it compiles whenever every remaining field is `Copy`. Do not claim it "moves out of `&self`" or "requires `Copy`".
- `Iterator`/`Rng` adapters that take `self` by value (e.g. `Rng::sample_iter`) work on immutable bindings. Do not claim a binding must be `mut` without checking whether the method takes `self`, `&self`, or `&mut self`.
- The standard library implements arithmetic between integers and `NonZero` types (e.g. `usize / NonZero<usize>`). Do not claim such impls are missing.
- Block expressions in statement position (`unsafe { ... }`, `if`, `match`, `loop`) do NOT need a trailing semicolon. Never post "missing semicolon" comments — syntax is the compiler's job, and CI already ran it.
- `str::strip_prefix`, `trim_matches`, and friends accept any `Pattern`, which includes `char` arrays/slices like `['n', 'N']`. Do not claim these calls are invalid.
- Moves, borrows, and drop order are checked by the compiler. Never post "use of moved value", "partial move", or "borrow conflict" comments — if the code is in the PR and CI is green, the borrow checker already accepted it.

## Project conventions

- Error handling uses `error-stack` (`Report`, `ReportSink`, `.change_context()`); suggest alternatives only within that framework.
- Doc comments use intra-doc links; only flag a doc link if it points at a genuinely different item than the one being documented, not a re-export or moved path.
- Prefer suggesting `cargo` tooling the repo uses: `cargo nextest run --package <name>`, `cargo clippy --all-features --package <name>`.

## What is worth flagging in Rust code here

- SQL built in Rust: missing `WHERE` conditions (e.g. draft/permission filters), missing `ORDER BY` when order feeds a deterministic contract, mispaired `unnest` arrays.
- Authorization: code paths that could return or leak data the actor cannot view.
- Unbounded allocation or CPU driven by user-controlled request parameters.
- Panics reachable from request handlers (`unwrap`, `expect`, indexing) on untrusted input.
