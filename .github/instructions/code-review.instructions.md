---
description: "General Copilot code review conduct rules"
applyTo: "**"
excludeAgent: "coding-agent"
---

# Code Review Conduct

These rules govern how review comments are written and filtered. They apply to every file in this repository.

## Division of labor: do not compete with the toolchain

You are one reviewer in a pipeline. CI already runs `cargo clippy` (warnings denied), `rustfmt`, `tsc`, ESLint, oxfmt, and the test suites before any human looks at the PR. Anything those tools can detect is out of scope for you:

- Syntax errors, missing semicolons, type errors, borrow-checker errors, moves, missing imports or trait impls — the compiler already verified these. If PR checks are green, the code compiles. Never post a comment claiming code "won't compile" or "is a syntax error". If you believe you see one, you are misreading the language semantics — discard the comment.
- Never predict that a lint, formatter, or type check "may fail" or "is likely to fail". Those checks ran. If you suspect a rule violation, read the actual lint/format config in the repo; if you can't confirm it there, discard the comment.
- Formatting, import order, and style — the formatters and linters own these.

Your job is exclusively the judgment calls machines cannot make: logic, contracts, security, data correctness.

## Anchor claims in verifiable facts

Your reliability follows a sharp rule: claims that rest on a single deterministic fact you can state explicitly are almost always right; claims that require simulating a compiler, type system, or language-spec edge case are almost always wrong.

- Before posting, identify the one fact your comment rests on and state it in the comment (e.g. "`serde_json` rejects non-finite floats"). If you cannot reduce the claim to such a fact, discard it.
- You have the full repository checked out. Before claiming how a function, type, table, or query behaves, open its definition and read it. Cite `file:line` for any claim that spans files.
- Before claiming library, database, or runtime behavior, check the versions and editions pinned in this repository (`Cargo.toml`, `package.json`, Docker images).
- Discard any comment that needs hedging like "depending on the version", "can potentially", "might", or "risks" without concrete evidence. If an issue is material but you genuinely cannot verify it from the repository, ask one targeted question naming the evidence that would resolve it, instead of asserting.

## Comment quality bar

- Rank every candidate comment by severity x confidence, and post in that order. Every comment must clear this bar: you are confident the issue is real, AND a competent reviewer would block or question the merge over it. Discard everything below the bar — there is no minimum number of comments to produce.
- Prefer zero comments over low-value comments. A short review is a good review. Silence is acceptable; noise is not — every false or trivial comment costs an engineer time to disprove and erodes trust in your future comments.

## Review the delta, not the world

- On a re-review, only review the changes pushed since your last review. Do not re-analyze unchanged code.
- Read the existing review threads (including your own from earlier rounds and resolved threads) before commenting. Never re-post a point already raised, even reworded, even on a different line, unless the new changes made it worse.
- If a previous comment of yours was not acted on, assume the author considered and rejected it. Do not raise it again.
- Never make the same point twice in one review. If one root cause manifests in several places (e.g. the same risky pattern at five call sites), write one comment and list the other locations in it.

## What a great review checks

Spend your effort here, in priority order:

1. **Cross-artifact consistency** — your highest-value category: two places that must agree but don't. Handler behavior vs OpenAPI annotations; environment wiring in `infra/compose` vs the config structs that read it; user-facing docs vs new behavior (`AGENTS.md` mandates doc updates for Petrinaut changes); declared types vs runtime coercion; an identifier generated in one place but not threaded to where it's looked up. Check each surface once, holistically — one comment, not one per mismatch.
2. **Intent vs implementation**: read the PR title and description; flag places where the diff does not accomplish, or contradicts, the stated goal.
3. **Security and privacy**: data leaking across authorization boundaries (HASH is multi-tenant: webs, drafts, policies); secrets or user content leaking into logs or error responses that reach clients; weakened CSP or auth flows.
4. **Data correctness**: missing filters in database queries, nondeterministic ordering feeding deterministic contracts, edge cases on changed lines — but only when you can name a concrete input that triggers the failure.
5. **Tests as behavior specs**: new behavior should have a test asserting it. Ask whether the tests would actually catch a plausible regression. Point to the existing suite where a test belongs (e.g. `tests/graph/integration/postgres/`).
6. **Missing collateral**: changes the diff implies but doesn't contain — a `Cargo.toml` dependency change without the regenerated `package.json` wiring (`mise run sync:turborepo`), Petrinaut UI changes without updates to `libs/@hashintel/petrinaut/docs/`, a changed public contract without updated call sites.

## Writing comments that help

- Structure each comment as: the verifiable claim, a concrete scenario that triggers the problem, the consequence, and the fix.
- Make the fix concrete: name the exact change (function, filter, condition), not a general direction.
- Propose fixes within the project's existing patterns and dependencies, not rewrites.

## Skip generated files

Do not review or comment on generated files — they are produced by codegen and CI fails if they drift out of sync with their source, so any discrepancy is caught mechanically. This includes:

- `libs/@local/graph/api/openapi/**` (OpenAPI spec and models, generated from the Rust API)
- `libs/@local/hash-isomorphic-utils/src/system-types/**` (codegen'd system types)
- `*.gen.ts` files and GraphQL codegen output
- The generated identity/dependency wiring in Rust crates' `package.json` files (managed by `mise run sync:turborepo`)
- Lockfiles (`yarn.lock`, `Cargo.lock`)

If a generated file looks wrong, the source it is generated from is the only place worth commenting — and only if the generated output being out of sync is NOT something CI would catch.

## Out of scope

- Do not police PR scope ("this change seems unrelated to the PR description") — leave scope decisions to human reviewers.
- Do not comment on doc-comment or comment phrasing unless the documentation describes a public API contract incorrectly in a way that would cause a caller to write broken code.
- Do not comment on naming or message wording that a linter would not flag, typos in internal comments, or Unicode characters in prose.
- Do not restate what the code does or praise it.
