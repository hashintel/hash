# Cargo Dependencies Skill

This skill provides guidance on adding and managing dependencies in Cargo.toml files in the HASH repository.

## Core Principles

✅ **DO:**

- Add external dependencies to workspace root [Cargo.toml](../../../Cargo.toml) `[workspace.dependencies]` section
- Use exact versions with `=` prefix for workspace root (e.g., `version = "=1.0.0"`)
- Set `default-features = false` for all dependencies unless specifically needed
- Use `workspace = true` when adding dependencies to package Cargo.toml
- Organize dependencies into 4 sections with comment headers
- Use `public = true` for dependencies that are part of public API
- Align dependency names using spaces for readability

❌ **DON'T:**

- Add version numbers directly in package Cargo.toml (use `workspace = true` instead)
- Use version ranges or `^` prefixes in workspace root
- Enable `default-features` without considering impact
- Mix different dependency types without section comments
- Forget to add `public = true` for dependencies exposed in public API

## Dependency Organization

Package `Cargo.toml` files must organize dependencies into **4 sections** with comment headers:

```toml
[dependencies]
# Public workspace dependencies
hash-graph-types = { workspace = true, public = true }
hashql-core      = { workspace = true, public = true }

# Public third-party dependencies
serde     = { workspace = true, public = true, features = ["derive"] }
tokio     = { workspace = true, public = true }
smallvec  = { workspace = true, public = true }

# Private workspace dependencies
error-stack = { workspace = true }
hash-codec  = { workspace = true }

# Private third-party dependencies
tracing       = { workspace = true }
regex         = { workspace = true }
derive_more   = { workspace = true, features = ["debug", "from"] }
```

**Section Order (Always):**

1. Public workspace dependencies
2. Public third-party dependencies
3. Private workspace dependencies
4. Private third-party dependencies

**Keep empty section comments even if no dependencies** (see [hashql-core/Cargo.toml](../../../libs/@local/hashql/core/Cargo.toml)).

## Adding Dependencies

### Step 1: Add to Workspace Root

First, check if the dependency exists in workspace root [Cargo.toml](../../../Cargo.toml):

```bash
grep "^my-crate" Cargo.toml
```

If it doesn't exist, add it to `[workspace.dependencies]`:

**For external crates:**

```toml
[workspace.dependencies]
# External dependencies
my-crate = { version = "=1.2.3", default-features = false }
```

**For workspace members:**

```toml
[workspace.dependencies]
# Workspace members
my-new-crate.path = "libs/@local/my-new-crate"
```

### Step 2: Add to Package

Determine which section the dependency belongs to:

- **Public workspace**: Workspace member exposed in public API
- **Public third-party**: External crate exposed in public API
- **Private workspace**: Workspace member used internally
- **Private third-party**: External crate used internally

Add to the appropriate section:

```toml
[dependencies]
# Public workspace dependencies
hashql-core = { workspace = true, public = true }

# Public third-party dependencies
serde = { workspace = true, public = true, features = ["derive"] }

# Private workspace dependencies
error-stack = { workspace = true }

# Private third-party dependencies
tracing = { workspace = true }
regex   = { workspace = true }
```

## Version Pinning

The repo uses **exact version pinning** for reproducible builds:

```toml
# ✅ Correct
serde = { version = "=1.0.228", default-features = false }
tokio = { version = "=1.47.1", default-features = false }

# ❌ Wrong
serde = { version = "1.0", default-features = false }
serde = { version = "^1.0.228", default-features = false }
tokio = "1.47"
```

## Default Features

Always disable default features at workspace level, enable specific features only where needed:

```toml
# In workspace Cargo.toml - disable defaults
tokio = { version = "=1.47.1", default-features = false }
serde = { version = "=1.0.228", default-features = false }

# In package Cargo.toml - enable specific features
tokio = { workspace = true, features = ["rt-multi-thread", "macros", "signal"] }
serde = { workspace = true, features = ["derive"] }
```

## Alignment and Formatting

Use consistent spacing for readability. Align the `=` signs within each section:

```toml
# Public workspace dependencies
hash-graph-types      = { workspace = true, public = true }
hashql-core           = { workspace = true, public = true }
hashql-diagnostics    = { workspace = true, public = true }

# Public third-party dependencies
anstyle   = { workspace = true, public = true }
foldhash  = { workspace = true, public = true }
hashbrown = { workspace = true, public = true }

# Private workspace dependencies

# Private third-party dependencies
bitvec               = { workspace = true, features = ["alloc"] }
derive_more          = { workspace = true, features = ["debug", "from"] }
unicode-segmentation = { workspace = true }
```

## Optional Dependencies

For optional features, use `optional = true` in dependencies and declare in `[features]`:

```toml
[dependencies]
# Private third-party dependencies
serde = { workspace = true, optional = true, features = ["derive"] }

[features]
serde = ["dep:serde", "text-size/serde"]
```

## Public Dependencies

Use `public = true` for dependencies that appear in your public API:

```toml
# Public because returned in function signatures or re-exported
serde      = { workspace = true, public = true }
tokio      = { workspace = true, public = true }
hash-codec = { workspace = true, public = true }

# Private because only used internally
tracing = { workspace = true }
regex   = { workspace = true }
```

## dev-dependencies

Dev dependencies don't need the 4-section structure or `public = true`:

```toml
[dev-dependencies]
insta         = { workspace = true }
proptest      = { workspace = true }
rstest        = { workspace = true }
test-strategy = { workspace = true }
```

## Example: @local/codec

See [hash-codec/Cargo.toml](../../../libs/@local/codec/Cargo.toml) for a complete example. Key points:

```toml
[dependencies]
# Public workspace dependencies
error-stack         = { workspace = true, public = true, optional = true }
harpc-wire-protocol = { workspace = true, public = true, optional = true }

# Public third-party dependencies
bytes      = { workspace = true, public = true }
serde_core = { workspace = true, public = true, optional = true }
uuid       = { workspace = true, public = true, optional = true, features = ["serde"] }

# Private workspace dependencies
# (empty but comment remains)

# Private third-party dependencies
dashu-base     = { workspace = true, optional = true, features = ["std"] }
derive_more    = { workspace = true, optional = true, features = ["display", "error"] }
simple-mermaid = { workspace = true }
```

Notice:

- All 4 section comments present even when section is empty (line 24-25)
- `public = true` for dependencies exposed in public API (`bytes`, `uuid`)
- No `public = true` for internal dependencies (`simple-mermaid`)
- Alignment within each section
- Many `optional = true` dependencies activated via `[features]`
