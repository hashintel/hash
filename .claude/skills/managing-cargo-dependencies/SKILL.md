---
name: managing-cargo-dependencies
description: Cargo.toml dependency management patterns for HASH workspace. Use when adding, updating, or removing dependencies, organizing Cargo.toml sections, configuring version pinning and default features, or managing public dependencies.
license: AGPL-3.0
metadata:
  triggers:
    type: domain
    enforcement: suggest
    priority: high
    keywords:
      - cargo
      - dependency
      - Cargo.toml
      - crate
      - workspace.dependencies
      - default-features
    intent-patterns:
      - "\\b(add|update|remove|manage)\\b.*?\\b(dependency|dependencies|crate|crates)\\b"
      - "\\bCargo\\.toml\\b"
      - "\\b(public|private)\\s+dependency\\b"
---

# Cargo Dependencies Management

Guidance for adding and managing dependencies in Cargo.toml files within the HASH repository's workspace structure.

## Core Principles

**HASH uses a strict workspace dependency pattern:**

✅ **DO:**

- Add external dependencies to workspace root `[workspace.dependencies]`
- Use caret version specifiers (e.g., `version = "1.0.0"` = `^1.0.0`)
- Set `default-features = false` for all dependencies unless specifically needed
- Use `workspace = true` in package Cargo.toml
- Organize dependencies into 4 sections with comment headers
- Use `public = true` for dependencies exposed in public API
- Align dependency names using spaces for readability

❌ **DON'T:**

- Add version numbers directly in package Cargo.toml
- Use exact versions with `=` prefix (e.g., `=1.0.0`) in workspace root
- Enable `default-features` without considering impact
- Mix different dependency types without section comments
- Forget `public = true` for dependencies exposed in public API

## Quick Reference

### The 4-Section Pattern

Every package `Cargo.toml` must organize dependencies into these sections:

```toml
[dependencies]
# Public workspace dependencies
hash-graph-types = { workspace = true, public = true }
hashql-core      = { workspace = true, public = true }

# Public third-party dependencies
serde     = { workspace = true, public = true, features = ["derive"] }
tokio     = { workspace = true, public = true }

# Private workspace dependencies
error-stack = { workspace = true }
hash-codec  = { workspace = true }

# Private third-party dependencies
tracing     = { workspace = true }
regex       = { workspace = true }
```

**Keep all 4 section comments even if a section is empty.**

### Quick Add Process

1. **Check workspace root** - Is dependency already there?
2. **Add to workspace if needed** - With caret version `1.2.3`
3. **Determine section** - Public workspace/third-party or private?
4. **Add to package** - Use `workspace = true` (+ `public = true` if needed)

## Detailed Guides

Choose the guide that matches the task:

### [workspace-setup.md](references/workspace-setup.md)

**Use when:** Adding new dependencies to workspace root

- How to add external crates to workspace
- Version pinning with exact versions
- Default features configuration
- Workspace member paths

### [package-dependencies.md](references/package-dependencies.md)

**Use when:** Adding dependencies to a package Cargo.toml

- The 4-section organizational structure
- Public vs private dependencies
- When to use `public = true`
- Alignment and formatting rules
- Feature configuration

### [examples-reference.md](references/examples-reference.md)

**Use when:** Looking for real examples from HASH codebase

- Complete examples from `@local/codec`
- Complete examples from `@local/hashql/core`
- Optional dependencies pattern
- dev-dependencies structure

## Common Patterns

### Adding a New External Dependency

```toml
# 1. Add to workspace root Cargo.toml
[workspace.dependencies]
my-crate = { version = "1.2.3", default-features = false }

# 2. Add to package Cargo.toml (appropriate section)
[dependencies]
# Private third-party dependencies
my-crate = { workspace = true }
```

### Making a Dependency Public

```toml
# Use when the dependency appears in your public API
serde = { workspace = true, public = true, features = ["derive"] }
tokio = { workspace = true, public = true }
```

### Optional Dependencies

```toml
[dependencies]
serde = { workspace = true, optional = true, features = ["derive"] }

[features]
serde = ["dep:serde", "other-dep/serde"]
```

## References

- [workspace-setup.md](references/workspace-setup.md) - Workspace root configuration
- [package-dependencies.md](references/package-dependencies.md) - Package dependency structure
- [examples-reference.md](references/examples-reference.md) - Real codebase examples
- [Workspace Cargo.toml](../../../Cargo.toml) - Root workspace configuration
- [hash-codec/Cargo.toml](../../../libs/@local/codec/Cargo.toml) - Reference example
- [hashql-core/Cargo.toml](../../../libs/@local/hashql/core/Cargo.toml) - Reference example
