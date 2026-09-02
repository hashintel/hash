---
name: exploring-rust-crates
description: Generate Rust documentation to understand crate APIs, structure, and usage. Use when exploring Rust code, understanding crate organization, finding functions/types/traits, or needing context about a Rust package in the HASH workspace.
license: AGPL-3.0
metadata:
  triggers:
    type: domain
    enforcement: suggest
    priority: medium
    keywords:
      - cargo doc
      - rust documentation
      - crate api
      - rust crate
      - module hierarchy
    intent-patterns:
      - "\\b(explore|understand|learn)\\b.*?\\b(rust|crate|package)\\b"
      - "\\b(what|how)\\b.*?\\b(functions|types|traits|api)\\b.*?\\bcrate\\b"
      - "\\bdocument(ation)?\\b.*?\\brust\\b"
---

# Exploring Rust Crates

Generate and use Rust documentation to understand crate APIs, structure, and code organization in the HASH workspace.

## Generating Documentation

### For a Specific Package

```bash
cargo doc --no-deps --all-features --package <package-name>
```

### For the Entire Workspace

```bash
cargo doc --no-deps --all-features --workspace
```

### Key Flags

- `--no-deps`: Document local code only (faster, less noise)
- `--all-features`: Include all feature-gated APIs
- `--package <name>`: Target a specific crate
- `--workspace`: Document all crates in the workspace
- `--document-private-items`: Include internal implementation details

## What Generated Docs Provide

1. **Crate organization** - Module hierarchy and component relationships
2. **Public API surface** - All public functions, types, traits, and constants
3. **Usage examples** - Code examples from doctest blocks
4. **Error documentation** - Documented error conditions and handling
5. **Type relationships** - Trait implementations, type aliases, associated types

## Viewing Documentation

Docs are generated at:

```txt
target/doc/<crate_name>/index.html
```

## Tips

- Generate docs before diving into unfamiliar Rust code
- Cross-reference `# Errors` sections for error handling patterns
- Look for `# Examples` sections for idiomatic usage patterns
