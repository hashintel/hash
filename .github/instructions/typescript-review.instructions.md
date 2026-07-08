---
description: "Review guidance for TypeScript/JavaScript changes"
applyTo: "**/*.{ts,tsx,js,jsx}"
excludeAgent: "coding-agent"
---

# TypeScript / JavaScript Review Rules

CI runs `tsc`, ESLint, and oxfmt on all of this code. These are language-spec facts that past reviews have gotten wrong — do not flag any of the following as bugs:

## Spec semantics reviewers commonly get wrong

- Optional chaining short-circuits the **entire** chain: in `a?.map(...).concat(...)`, if `a` is nullish the whole expression is `undefined` — the later `.concat` does NOT throw. A trailing `?? fallback` handles the nullish case.
- `Array.prototype.sort` is guaranteed **stable** by the spec (ES2019+). Do not claim sort stability is implementation-defined.
- Do not claim an ESLint rule "will flag" code without reading the actual ESLint config in the repo. If the code is in the diff and CI is green, ESLint accepted it.

## Where your judgment is reliable — lean into these

Claims resting on a single deterministic runtime fact are your strength. Examples of the kind of comment that has proven valuable here:

- `JSON.stringify` throws on `BigInt` values — a problem when serializing values that may contain them (e.g. UUID attributes).
- `Number.parseFloat("Infinity") || 0` passes `Infinity` through — truthiness checks don't guard against non-finite numbers.
- Spreading a large array into `fn(...args)` or `arr.push(...huge)` can overflow the argument stack.
- String coercion of typed values (`Number.parseFloat(cell) || 0` on text that may not be numeric) silently corrupting persisted data.

## Project conventions

- The frontend is Next.js with MUI; API code uses GraphQL (Apollo) and the graph REST client.
- Async correctness matters: unawaited promises in sequential logic, effects with missing/extra dependencies that re-trigger flows (e.g. auth/registration flows), and cleanup that races initialization are all worth flagging — with a concrete trigger scenario.
- UI component references must exist: e.g. icon `name` props must match the design-system `IconMap`; verify against the component's definition before flagging, and flag when a referenced variant genuinely does not exist.
