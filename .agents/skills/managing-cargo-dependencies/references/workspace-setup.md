# Workspace Setup Guide

Complete guide for managing dependencies in the workspace root Cargo.toml.

---

## Checking Existing Dependencies

Before adding a new dependency, check if it already exists:

```bash
grep "^my-crate" Cargo.toml
```

Or search within the workspace.dependencies section:

```bash
grep -A 1 "^\[workspace.dependencies\]" Cargo.toml | grep "my-crate"
```

---

## Adding External Crates

All external crates must be defined in workspace root `[workspace.dependencies]`:

### Basic External Dependency

```toml
[workspace.dependencies]
# External dependencies
serde = { version = "1.0.228", default-features = false }
tokio = { version = "1.47.1", default-features = false }
regex = { version = "1.11.1", default-features = false }
```

### With Features (at workspace level)

```toml
[workspace.dependencies]
# When you need features enabled everywhere
derive_more = { version = "1.0.0", default-features = false, features = ["debug", "from"] }
```

**Note:** Usually better to enable features at package level for granular control.

---

## Version Specifiers

HASH uses **caret version specifiers** (e.g., `1.0.228` = `^1.0.228`) for reproducible builds with `Cargo.lock`:

✅ **Correct:**

```toml
serde = { version = "1.0.228", default-features = false }
tokio = { version = "1.47.1", default-features = false }
```

❌ **Wrong:**

```toml
serde = { version = "=1.0.228", default-features = false } # Exact pinning (not needed)
tokio = "1.47"                                              # No shorthand
serde = { version = "1.0", default-features = false }      # Too vague
```

---

## Default Features

Always disable default features at workspace level:

```toml
[workspace.dependencies]
# Disable defaults - enable features where needed
tokio = { version = "=1.47.1", default-features = false }
serde = { version = "=1.0.228", default-features = false }
regex = { version = "=1.11.1", default-features = false }
```

Then enable specific features in package Cargo.toml:

```toml
# In package Cargo.toml
[dependencies]
tokio = { workspace = true, features = ["rt-multi-thread", "macros"] }
serde = { workspace = true, features = ["derive"] }
```

**Note:** Workspace root should have `default-features = false`, but package level can override with specific features.

### Why Disable Defaults?

- **Smaller binaries** - Only include what you need
- **Faster compile times** - Less code to compile
- **Explicit dependencies** - Clear what features each package uses
- **Avoid bloat** - Default features often include unnecessary functionality

---

## Workspace Members

For internal crates (workspace members), use path references:

```toml
[workspace.dependencies]
# Workspace members
error-stack.path = "libs/error-stack"
hash-codec.path = "libs/@local/codec"
hash-graph-types.path = "libs/@local/hash-graph-types"
hashql-core.path = "libs/@local/hashql/core"
```

**Note:** Use relative paths from workspace root.

---

## Organizing Workspace Dependencies

Group related dependencies with comments:

```toml
[workspace.dependencies]
# Core error handling
error-stack = { path = "libs/error-stack" }

# Async runtime
tokio = { version = "1.47.1", default-features = false }
tokio-util = { version = "0.7.13", default-features = false }

# Serialization
serde = { version = "1.0.228", default-features = false }
serde_json = { version = "1.0.138", default-features = false }

# Database
postgres = { version = "0.19.9", default-features = false }
postgres-types = { version = "0.2.8", default-features = false }
```

---

## Finding Latest Versions

```bash
# Check crates.io for latest version
cargo search my-crate --limit 1

# Or use cargo-edit (if installed)
cargo add my-crate --dry-run
```

---

## Common Patterns

### Adding a Popular Crate

```toml
[workspace.dependencies]
# Add to appropriate section
tracing = { version = "0.1.41", default-features = false }
```

### Adding with Specific Features (workspace-wide)

```toml
[workspace.dependencies]
# When all packages need the same features
uuid = { version = "1.11.0", default-features = false, features = ["v4", "serde"] }
```

### Adding Workspace Member

```toml
[workspace.dependencies]
my-new-crate.path = "libs/@local/my-new-crate"
```

---

## Related

- [package-dependencies.md](package-dependencies.md) - Adding to package Cargo.toml
- [examples-reference.md](examples-reference.md) - Real examples from HASH
- [Workspace Cargo.toml](../../../../Cargo.toml) - Root configuration
