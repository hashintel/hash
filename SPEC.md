# sym2.rs symbols! macro specification

## Goal

Define a declarative `symbols!` macro in `libs/@local/hashql/core/src/symbol/sym2.rs` that expands a compact symbol list into:

- A single global string table `SYMBOLS` containing every symbol literal exactly once.
- `const` `Symbol` values for each symbol name (including nested modules).
- A `phf::Map` lookup table from string to `Symbol`.

## Inputs

The macro is invoked in `sym2.rs` with a mixture of:

- Bare identifiers (e.g., `access, add`).
- Identifier-to-string pairs using `name: "..."` (e.g., `r#if: "if"`).
- Nested module blocks using `module_name: { ... }` with the same item forms inside.

## Outputs and behavior

1. **Global string table**
   - Emit `static SYMBOLS: &[&str] = &[ ... ];` that contains **all** symbol string values, in macro traversal order.
   - Order is deterministic and mirrors the macro input order, flattening nested blocks in-place.
   - Each string appears **exactly once**; duplicates are detected by a runtime test.

2. **Symbol constants**
   - For each symbol item, emit a `const <name>: Symbol = Symbol::constant_unchecked(<index>);`.
   - The `<index>` is the position of the symbol’s string in `SYMBOLS`.
   - When items are inside `module_name: { ... }`, emit a `mod module_name { use super::*; ... }` containing the `const`s for that module’s items.

3. **Lookup map**
   - Emit `static LOOKUP: phf::Map<&'static str, Symbol> = phf_map! { ... };`.
   - Each entry maps the **string value** to the corresponding `Symbol` constant.
   - The map includes entries for both top-level and nested module items, with the value referencing the correct constant (e.g., `"*" => symbol::asterisk`).

4. **Uniqueness checks**
   - No macro-time checks; uniqueness is enforced by a runtime test that fails if duplicate strings exist in `SYMBOLS`.

## Expansion details

Given the existing example in `sym2.rs`, the expansion will:

- Generate `SYMBOLS` covering: `"access"`, `"add"`, `"and"`, `"archived"`, `"archived_by_id"`, `"bar"`, `"BaseUrl"`, `"bit_and"`, `"bit_not"`, `"bit_or"`, `"if"`, `"<!dummy!>"`, `"'<ClosureEnv>"`, `"*"`, `"0"`, `"1"`, `"::core::option::Option"`, `"::core::option::Some"`, `"::core::option::None"`, `"::graph::head::entities"`, `"::graph::body::filter"`, `"::graph::tail::collect"`.
- Create `const` bindings for each name in the correct scope, each using the index into `SYMBOLS`.
- Create a `LOOKUP` `phf_map!` with all strings mapped to their corresponding `Symbol` constants.

## Implementation approach

1. **Define the macro interface** to accept a comma-separated list of `symbol_item` forms:
   - `ident` (string = ident name)
   - `ident : literal` (string = literal)
   - `module_ident : { ... }`

2. **Flatten items** into a single sequence of `(string_literal, const_path)` in the exact order of appearance.
   - For nested modules, the `const_path` is `module_ident::item_ident`.

3. **Generate indices** by counting from `0` in the flattened order.
   - Use a recursive macro to emit tuples `((string, path), index)` as it walks the input.

4. **Emit `SYMBOLS`** by collecting the flattened string list.

5. **Emit consts**
   - For top-level items: `const name: Symbol = Symbol::constant_unchecked(index);`.
   - For module items: `mod module { use super::*; const name: Symbol = Symbol::constant_unchecked(index); }`.

6. **Emit `LOOKUP`** by mapping each flattened string to its `const_path`.

7. **Uniqueness enforcement**
   - Add a `#[test]` in `sym2.rs` that inserts every entry from `SYMBOLS` into a `HashSet` and asserts that the set size equals `SYMBOLS.len()`.
   - The test is the only enforcement mechanism; compilation is not affected.

## Definition of done

- `sym2.rs` contains the new `symbols!` macro that expands as specified.
- `SYMBOLS`, all `const` symbols, and `LOOKUP` are generated from the macro invocation.
- Duplicate string values fail the uniqueness test.
- Code builds without additional files or edits outside `sym2.rs` (other than this spec file).
