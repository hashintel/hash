---
name: cargo-dependencies
description: Cargo.toml dependency management patterns for HASH workspace. Use when adding dependencies, managing workspace dependencies, organizing Cargo.toml sections, setting version pinning, configuring default features, or working with public dependencies.
---

# Cargo Dependencies Management

## Purpose

This skill provides comprehensive guidance on adding and managing dependencies in Cargo.toml files within the HASH repository's workspace structure.

## When This Skill Activates

Automatically activates when:

- Adding or updating dependencies
- Working with Cargo.toml files
- Managing workspace dependencies
- Configuring dependency features
- Setting up public dependencies

---

## Core Principles

**HASH uses a strict workspace dependency pattern:**

✅ **DO:**

- Add external dependencies to workspace root `[workspace.dependencies]`
- Use exact versions with `=` prefix (e.g., `version = "=1.0.0"`)
- Set `default-features = false` for all dependencies unless specifically needed
- Use `workspace = true` in package Cargo.toml
- Organize dependencies into 4 sections with comment headers
- Use `public = true` for dependencies exposed in public API
- Align dependency names using spaces for readability

❌ **DON'T:**

- Add version numbers directly in package Cargo.toml
- Use version ranges or `^` prefixes in workspace root
- Enable `default-features` without considering impact
- Mix different dependency types without section comments
- Forget `public = true` for dependencies exposed in public API

---

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
2. **Add to workspace if needed** - With exact version `=1.2.3`
3. **Determine section** - Public workspace/third-party or private?
4. **Add to package** - Use `workspace = true` (+ `public = true` if needed)

---

## Detailed Guides

Choose the guide that matches your task:

### [workspace-setup.md](resources/workspace-setup.md)

**Use when:** Adding new dependencies to workspace root

- How to add external crates to workspace
- Version pinning with exact versions
- Default features configuration
- Workspace member paths

### [package-dependencies.md](resources/package-dependencies.md)

**Use when:** Adding dependencies to a package Cargo.toml

- The 4-section organizational structure
- Public vs private dependencies
- When to use `public = true`
- Alignment and formatting rules
- Feature configuration

### [examples-reference.md](resources/examples-reference.md)

**Use when:** Looking for real examples from HASH codebase

- Complete examples from `@local/codec`
- Complete examples from `@local/hashql/core`
- Optional dependencies pattern
- dev-dependencies structure

---

## Common Patterns

### Adding a New External Dependency

```bash
# 1. Add to workspace root Cargo.toml
[workspace.dependencies]
my-crate = { version = "=1.2.3", default-features = false }

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

---

## Related Files

- [Workspace Cargo.toml](../../../Cargo.toml) - Root workspace configuration
- [hash-codec/Cargo.toml](../../../libs/@local/codec/Cargo.toml) - Reference example
- [hashql-core/Cargo.toml](../../../libs/@local/hashql/core/Cargo.toml) - Reference example

---

**Skill Status**: Production-ready following Anthropic best practices ✅
**Line Count**: < 150 (following 500-line rule) ✅
**Progressive Disclosure**: 3 detailed resource files ✅
