# Rust design guidelines

**Many focused modules. Concrete code. Few abstractions.**

These guidelines apply to new code and refactors in this application. Optimize for finding code, following execution, and making changes locally. Any added complexity must earn its place by solving a problem we have today.

## 1. Make modules the map of the system

Organize by feature or subsystem, then split by responsibility. A reader should be able to predict where behavior lives from the module tree.

- Use modules liberally for distinct concerns. Keep tightly related types, behavior, and tests together.
- Name modules after what they do or represent. Avoid project-wide `utils`, `helpers`, `types`, `traits`, and `impls` buckets.
- Use `name/mod.rs` for modules with children and `name.rs` for leaf modules.
- Make `mod.rs` the subsystem's entry point: declarations, selected re-exports, and small amounts of central logic. Put substantial distinct behavior in named child modules.
- Add nesting when it expresses a meaningful relationship. Do not split code merely to shorten files or enforce one type per file.

```text
src/
├── main.rs
├── app.rs
├── jobs/
│   ├── mod.rs
│   ├── submit.rs
│   ├── validate.rs
│   └── schedule.rs
└── storage/
    ├── mod.rs
    ├── store.rs
    └── migrations.rs
```

Each module should have a clear responsibility and a small interface. Keep implementation details private. Use `pub(super)` or `pub(crate)` where needed; reserve `pub` for intentional cross-crate APIs.

Re-export selected entry points at the subsystem boundary. Keep useful submodule names visible rather than flattening everything into the crate root. Avoid wildcard exports and chains of re-exports.

Dependencies should flow in a clear direction. If two subsystems keep reaching into each other's internals, fix the boundary. Moving shared code into `common` does not resolve unclear ownership.

## 2. Start concrete; abstract when necessary

Use free functions, concrete structs with inherent methods, and enums for most application code. A module boundary does not need a trait boundary.

Introduce a custom trait only for a current need: genuinely interchangeable implementations, a required integration contract, or a narrow test seam around external behavior. State what must vary and why a concrete type, enum, or function parameter is insufficient.

- Do not create a trait for every struct or subsystem.
- Do not add extension points because another backend or variant might exist someday.
- Prefer an enum and `match` for a small set of variants controlled by this application.
- Prefer a function or closure parameter when only one operation needs to vary.
- Keep generics and trait bounds inside the component that needs them. Do not propagate a backend type parameter through the application by default.
- Avoid trait hierarchies, blanket extension traits, and abstract factories for fixed dependencies.

Standard traits such as `Debug`, `Iterator`, and `TryFrom` are ordinary Rust and should be used where appropriate. The high bar applies to inventing abstractions.

Accept a little duplication when the alternative requires flags, callbacks, or complicated generic bounds. Extract code when it expresses the same rule and should change together. Keep critical business rules in one place; a concrete function is often enough.

## 3. Keep macros exceptional

Use ordinary derives, logging macros, and established library macros where they simplify code.

Do not write a custom macro when a function or type will do. A custom macro must remove substantial mechanical repetition that ordinary Rust cannot express cleanly. Keep it small and local. Business logic and application wiring must remain readable as ordinary Rust.

## 4. Default to modules, not new crates

Create an internal crate only for a substantial boundary: real independent reuse, a different build target, or dependency isolation worth enforcing through the build graph.

Code organization alone is a reason for a module. A subsystem does not automatically deserve a crate. Avoid tiny interface crates, shared-types crates, and crate splits that mostly create public plumbing.

Do not add abstraction layers merely to wrap dependencies. Add an adapter when it meaningfully simplifies the application's interface or contains complexity.

## 5. Keep the execution path direct

A reader should reach meaningful behavior without stepping through layers of forwarding methods, factories, and generated code.

- Prefer explicit inputs and dependencies over global context objects or dependency-injection frameworks.
- Extract helpers that name meaningful operations. Avoid helpers that merely forward arguments.
- Use straightforward control flow. Choose a loop over a clever iterator chain when it is easier to follow.
- Prefer ordinary constructors. Introduce builders only when construction is actually complex.
- Keep useful names and intermediate values. Concise code minimizes mental effort, not character count.
- Do not add unused variants, configuration switches, or speculative compatibility layers.

## 6. Refactor toward fewer concepts

A refactor should make responsibilities clearer and behavior easier to trace. Moving code into more files is not enough.

Preserve existing behavior unless a change is intentional. Separate structural moves from behavior changes where practical, and verify the affected contracts. Remove obsolete traits, wrappers, forwarding layers, and temporary adapters once callers are migrated.

For a new module, start with one responsibility, concrete entry points, and a real caller. Let actual requirements determine further structure.

## Review questions

- Can I predict where this behavior lives?
- Can I follow it without unnecessary jumps or indirection?
- Does every new trait, macro, generic parameter, and crate solve a current problem?
- Would concrete code or a small amount of duplication be clearer?
- Does this change leave fewer concepts for the next reader to understand?

Exceptions need a concrete reason in review. Update this guide when experience changes our preference; keep general Rust advice elsewhere.

## References

The simplicity preference aligns with [Ethrex's design principles](https://github.com/lambdaclass/ethrex/blob/main/README.md#design-principles). Module layout and visibility follow the [Rust Book](https://doc.rust-lang.org/book/ch07-02-defining-modules-to-control-scope-and-privacy.html) and [Rust Reference](https://doc.rust-lang.org/reference/visibility-and-privacy.html). These are project choices, not universal rules for Rust libraries.
