---
name: documenting-typescript-code
description: TypeScript documentation and comment-writing guide for doc comments (TSDoc), file headers, and inline comments. Use when writing or reviewing doc comments, documenting functions/types/modules, writing inline comments, explaining invariants, or auditing comment quality in TypeScript code.
license: AGPL-3.0
metadata:
  triggers:
    type: domain
    enforcement: suggest
    priority: high
    keywords:
      - tsdoc
      - jsdoc
      - doc comment
      - inline comment
      - documentation
    intent-patterns:
      - "\\bdocument(ing|ation)?\\b.*?\\b(typescript|function|type|interface|class|module)\\b"
      - "\\b(write|add|create|review|clean)\\b.*?\\bcomments?\\b"
---

# TypeScript Documentation Guide

## Purpose

Use this skill to write or revise TypeScript documentation — TSDoc comments, file headers, and inline `//` comments — that is practical, user-oriented, explicit about contracts, and honest about tradeoffs. The goal is documentation that helps a reader make a correct decision quickly, then gives them enough detail to avoid surprises later.

The key trait is explicitness without fuss. Docs should feel like an experienced maintainer sitting next to the reader saying, "Here is the thing, here is how you use it, and here are the traps."

## Maintaining this skill

This is a living document. When a doc comment gets corrected or reworded in review, or a pattern emerges that is not captured here, update the skill to reflect it. The same applies in reverse: if a rule consistently produces worse docs than ignoring it, rework or remove that section. The goal is a skill that stays useful, not one that stays unchanged.

## The three comment layers

TypeScript code has three distinct documentation layers, each with its own job:

1. **File header block** — a `/** ... */` (or plain block) comment at the top of a module. States what the module owns, the mental model, and the invariants that span the whole file. Required for modules with non-trivial responsibilities; skip for trivial re-export or single-component files.
2. **TSDoc on exported items** — `/** ... */` on exported functions, classes, interfaces, and non-obvious constants. This is the contract surface.
3. **Inline `//` comments** — explain _why_, record invariants and non-obvious behavior at the point where a reader would otherwise be surprised. Never narrate _what_ the code already says.

The test for what goes where: **"Would a maintainer need to understand this to judge whether a change is safe?"** If yes, it belongs in the doc comment or file header. If it just explains how the sausage is made, it belongs inline — or nowhere.

## Doc comments (TSDoc)

### Shape

Use this structure for exported items, in order, dropping sections that do not apply:

1. Summary sentence.
2. Behavior paragraph — the mental model, in terms of caller intent.
3. Guarantees, defaults, and caveats.
4. Failure modes (`@throws`), invariants, complexity.
5. `@example` when the usage is non-obvious.
6. `@see` links to alternatives.

### Summary sentence

Everything before the first blank line is the reader's first impression. Make it say what the item _is_ (types: noun phrase) or _does_ (functions: verb phrase) without restating the name.

Good:

```ts
/** Returns the index of the first entity whose circle contains the point. */
```

Weak (restates the signature):

```ts
/** Gets the entity index. */
```

### Behavior paragraph

Explain the operation in terms of caller intent. Include what is returned when nothing is found, whether returned values are copies or live views, whether the operation mutates its input, and whether it allocates when that matters.

Do not restate what the signature already shows. Instead of "returns a `number | undefined`", say "Returns `undefined` when the entity has not been assigned a cluster yet."

### Guarantees

State guarantees explicitly and sparingly — a guarantee is a contract:

- "The returned array is sorted by entity index."
- "The view remains valid across in-place buffer growth; it is republished only on reallocation."
- "This runs in `O(members)` time and does not allocate."
- "Safe to call before `init`; the call is a no-op until the worker is ready."

### `@throws` and rejection

Document concrete conditions for thrown errors and rejected promises. TypeScript has no checked errors, so the doc comment is the only place a caller learns what can fail:

```ts
/**
 * @throws When `byteLength` exceeds the buffer's `maxByteLength`;
 *   callers must republish through {@link RepublishHandler} instead.
 */
```

Avoid "Throws an error if something goes wrong."

### Invariants (the `# Safety` analog)

TypeScript's unsafe corners — `as` casts, non-null `!`, `SharedArrayBuffer`/`Atomics` protocols, index arithmetic into typed arrays, branded-type constructions — need caller obligations stated as invariants, not suggestions:

```ts
/**
 * Invariant: callers must only pass indices previously returned by
 * `insert`; the store does not bounds-check in production builds.
 */
```

Every `as` cast at a boundary needs a comment justifying why it is sound. An unexplained cast is a review defect.

### Tags

- `{@link TypeName}` on first mention of a type, function, or module in prose. Plain backticks are for code snippets, keywords, and literal values — not type references.
- `@param` only when the parameter's role is not obvious from its name and type. Never write `@param count - The count`.
- `@returns` only when the return needs explanation beyond the behavior paragraph. Prefer describing the return inline in prose.
- `@defaultValue` on configuration fields and options.
- `@example` for non-obvious usage; examples should demonstrate why the API matters, not just that it can be called. App-internal code rarely needs them; shared utilities and tricky pure functions often do.
- `@deprecated` with a pointer to the replacement.

### Configuration and options

Every config knob documents three things: what the setting changes, its default, and the tradeoff of turning it. If enabling a mode worsens some behavior, say so directly:

```ts
/**
 * Maximum solver epochs spent in the separation phase before giving up.
 *
 * @defaultValue 40. Raising it improves overlap removal on dense graphs
 * at the cost of longer settle times; lowering it can leave residual
 * overlaps that the renderer must tolerate.
 */
```

## Inline comments

Inline comments are the highest-leverage and most abused layer. The rules:

### Why, not what

A comment that narrates the next line is noise. A comment that explains why the code is shaped this way — the constraint, the bug it avoids, the profile that motivated it — is load-bearing.

Weak:

```ts
// Increment the version counter.
version += 1;
```

Good:

```ts
// Bump version before writing positions so a torn read on the main
// thread fails the seqlock check and retries, rather than rendering
// a half-written frame.
version += 1;
```

### Affirmative, present tense

State what IS, not what WAS or what ISN'T. Never comment what was removed or changed (`// removed X`, `// previously…`, `// no longer needed`) — history is git's job. Never describe roads not taken in code comments; contrastive rationale ("we chose X over Y because…") is fine when the alternative is the _obvious_ choice a maintainer would otherwise reach for.

This includes "current state framed as a change". The reader was not there for the change; describe the role, not the transition:

Weak (narrates the transition):

```ts
/** Only exercised by benches/tests now that production's community-force
 *  tier runs the stress layout instead of FA2. */
```

Good (states the present role and where to look):

```ts
/** FA2 reference engine for the community-force tier, reachable from benches
 *  and tests only: production selects `stress-layout.ts` for this tier. */
```

### Place comments at the point of surprise

- Per-branch comments beat a block comment above a `switch`/`if`-chain when each branch needs its own explanation.
- A magic number gets its justification on the same line or the line above — including where it came from ("matches Deck.gl's default pick radius", "empirically flat above 8 on M1/Chrome profiles").
- Performance-motivated distortions (loop hoisting, manual inlining, typed-array pooling, avoiding closures in hot paths) get a comment naming the hot path and why the straightforward version was not used. Otherwise the next maintainer will "clean it up".

### Concurrency and protocol comments

Code that coordinates across threads (workers, `SharedArrayBuffer`, `Atomics`) documents its protocol where the coordination happens: who writes, who reads, what ordering guarantees hold, and what happens on the failure path. A memory-ordering decision without a comment is unreviewable.

### Comment hygiene

- No ASCII banners or decorative separators.
- No ALL-CAPS emphasis in prose (keep legitimate acronyms such as `SAB`, `LOD`, `GPU`).
- Section labels and inline emphasis use sentence case; domain terms may use backticks (e.g. `packing-bound`).
- Debug hook and flag names in comments use kebab-case to match the code.
- No commented-out code. Delete it; git remembers.
- No caller narration ("Used by Scene to…"). Describe what the code provides.
- No composition narration ("wraps a Foo", "this is a thin wrapper around"). State the semantic purpose.
- TODOs name the condition under which they get resolved, not just a wish: `// TODO: fold into CutIndex once link entities join type-set groups.` A TODO with no trigger is a lie with a timestamp.

## Narration anti-patterns

These phrases are smells. When you catch yourself writing them, rewrite to state the guarantee or contract instead.

| Smell                               | Problem                  | Rewrite as                              |
| ----------------------------------- | ------------------------ | --------------------------------------- |
| "Wraps a `Foo`" / "Backed by `Foo`" | Narrates structure       | State what the item IS                  |
| "Contains the bytes for"            | Narrates storage         | State what the item provides            |
| "Used by X to…" / "Called from Y"   | Narrates callers         | Describe the provided behavior          |
| "Stores the value in a Map"         | Narrates implementation  | State the performance guarantee, if any |
| "This is a thin wrapper around"     | Narrates composition     | State the semantic purpose              |
| "Helper function for…"              | Narrates role, not value | Say what it computes and when to use it |
| "Removed the old…" / "No longer…"   | Narrates history         | Delete; git remembers                   |

## File headers

A strong file header reads like a short tour, roughly in this order:

1. One sentence: what this module owns.
2. The mental model — primary types/operations and their relationship, stated operationally (what a caller _does_ with them, not a struct listing).
3. Invariants and protocols that span the file (threading, buffer lifecycles, ordering requirements).
4. Honest limits: what this module intentionally does not handle, when that omission is central to correct expectations.

Correctness-critical implementation details belong here — the ones that explain why the approach is sound and when it would break. Incidental details (which collection type backs a map) do not.

## Editing pass

After drafting, check at three distances:

1. First screen: can a reader identify what the item/module is and when to use it?
2. Middle: is the mental model clear? Are defaults and failure modes explicit?
3. Details: are invariants, complexity, and unsupported cases stated where a maintainer would look before changing the code?

Then remove generic filler. The style is detailed, but every detail earns its place.

## Review checklist

Before finalizing documentation or a comment pass:

- First sentence says what the item is; no doc merely restates the signature or name.
- Fallible operations document concrete failure conditions.
- Casts, non-null assertions, and index arithmetic carry invariant justifications.
- Config knobs state default + tradeoff.
- Inline comments explain why, are affirmative and present-tense, and sit at the point of surprise.
- No banners, no commented-out code, no history narration, no caller narration, no ALL-CAPS emphasis in prose.
- Concurrency protocols are documented where the coordination happens.
- Every `{@link}` resolves; plain backticks are not used for type references.
