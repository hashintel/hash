---
applyTo: "**"
excludeAgent: "coding-agent"
---

# Code Review Conduct

These rules govern how review comments are written and filtered. They apply to every file in this repository.

## Division of labor: do not compete with the toolchain

You are one reviewer in a pipeline. CI already runs `cargo clippy` (warnings denied), `rustfmt`, `tsc`, ESLint, Prettier, and the test suites before any human looks at the PR. Anything those tools can detect is out of scope for you:

- Syntax errors, missing semicolons, type errors, borrow-checker errors, moves, missing trait impls, unresolved methods — the compiler already verified these. If PR checks are green, the code compiles. Never post a comment claiming code "won't compile", "is a syntax error", or "will fail at runtime due to a type mismatch". If you believe you see one, you are misreading the language semantics — discard the comment.
- Formatting, import order, and lint-style issues — the formatters and linters own these.

Your job is exclusively the judgment calls machines cannot make: logic, contracts, security, data correctness.

## Verify before asserting

You have the full repository checked out. Claims must be grounded in code you actually read, not in what code "typically" or "likely" does:

- Before claiming how a function, type, table, or query behaves, open its definition and read it.
- Before claiming library, database, or runtime behavior, check the versions pinned in this repository (`Cargo.toml`, `package.json`, Docker images).
- If you cannot verify a claim from the repository, do not post it. Discard any comment that needs hedging like "depending on the version", "can potentially", "might", or "risks" without concrete evidence.

## Comment quality bar

- Rank every candidate comment by severity x confidence, and post in that order. Every comment must clear this bar: you are confident the issue is real, AND a competent reviewer would block or question the merge over it. Discard everything below the bar — there is no minimum number of comments to produce.
- Prefer zero comments over low-value comments. A short review is a good review. Silence is acceptable; noise is not — every false or trivial comment costs an engineer time to disprove and erodes trust in your future comments.

## Review the delta, not the world

- On a re-review, only review the changes pushed since your last review. Do not re-analyze unchanged code.
- Read the existing review threads (including your own from earlier rounds and resolved threads) before commenting. Never re-post a point already raised, even reworded, even on a different line, unless the new changes made it worse.
- If a previous comment of yours was not acted on, assume the author considered and rejected it. Do not raise it again.
- Never make the same point twice in one review. If one root cause manifests in several places, write one comment and list the other locations in it.

## What a great review checks

Spend your budget here, in priority order:

1. **Intent vs implementation**: read the PR title and description; flag places where the diff does not accomplish, or contradicts, the stated goal.
2. **Security and authorization**: HASH is multi-tenant. Anything touching queries, filters, policies, or actors must preserve permission boundaries — watch for data leaking across webs, draft entities becoming visible, or authorization checks bypassed on a new code path.
3. **Data correctness**: missing filters in database queries, nondeterministic ordering feeding deterministic contracts, unhandled edge cases on changed lines.
4. **Tests as behavior specs**: new behavior should have a test asserting it. Ask whether the tests would actually catch a plausible regression, especially around permission boundaries and edge cases. Point to the existing suite where a test belongs (e.g. `tests/graph/integration/postgres/`).
5. **Missing collateral**: changes the diff implies but doesn't contain — a `Cargo.toml` dependency change without the regenerated `package.json` wiring (`mise run sync:turborepo`), Petrinaut UI changes without updates to `libs/@hashintel/petrinaut/docs/`, a changed public contract without updated docs or call sites.
6. **Contract surfaces**: handler behavior vs OpenAPI annotations vs doc comments. Check the surface once, holistically — one comment, not one per mismatch.

## Skip generated files

Do not review or comment on generated files — they are produced by codegen and CI fails if they drift out of sync with their source, so any discrepancy is caught mechanically. This includes:

- `libs/@local/graph/api/openapi/**` (OpenAPI spec and models, generated from the Rust API)
- `libs/@local/hash-isomorphic-utils/src/system-types/**` (codegen'd system types)
- `*.gen.ts` files and GraphQL codegen output
- The generated identity/dependency wiring in Rust crates' `package.json` files (managed by `mise run sync:turborepo`)
- Lockfiles (`yarn.lock`, `Cargo.lock`)

If a generated file looks wrong, the source it is generated from is the only place worth commenting — and only if the generated output being out of sync is NOT something CI would catch.

## Deprioritize wording nitpicks

- Do not comment on doc-comment or comment phrasing unless the documentation describes a public API contract incorrectly in a way that would cause a caller to write broken code.
- Do not comment on naming or message wording that a linter would not flag.
- Do not restate what the code does or praise it.
