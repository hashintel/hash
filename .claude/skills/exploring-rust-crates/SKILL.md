---
name: exploring-rust-crates
description: Generating Rust documentation to understand crate APIs, structure, and usage. Use when exploring Rust code, understanding crate organization, finding functions/types/traits, or needing context about a Rust package in the HASH workspace. (project)
---

# Exploring Rust Crates

## Purpose

Guide for generating and using Rust documentation to understand crate APIs, structure, and code organization in the HASH workspace.

## When to Use

- Understanding a new Rust crate's API
- Exploring available functions, types, and traits
- Finding usage examples in doctest code blocks
- Understanding crate organization and component relationships
- Getting context about error conditions and handling
- Generating test data based on documented structures

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

- `--no-deps`: Only document local code, not dependencies (faster, less noise)
- `--all-features`: Include all feature-gated APIs
- `--package <name>`: Target a specific crate
- `--workspace`: Document all crates in the workspace

## What Generated Docs Provide

1. **Crate organization** - Module hierarchy and component relationships
2. **Public API surface** - All public functions, types, traits, and constants
3. **Usage examples** - Code examples from doctest blocks
4. **Error documentation** - Documented error conditions and handling
5. **Type relationships** - Trait implementations, type aliases, associated types

## Viewing the Documentation

After generation, docs are available at:

```
target/doc/<crate_name>/index.html
```

Open in browser or use the content for understanding the API structure.

## Tips

- Generate docs before diving into unfamiliar Rust code
- Use `--document-private-items` if you need to understand internal implementation
- Cross-reference with `# Errors` sections for error handling patterns
- Look for `# Examples` sections for idiomatic usage patterns
