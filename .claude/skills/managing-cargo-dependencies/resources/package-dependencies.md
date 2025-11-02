# Package Dependencies Guide

Complete guide for managing dependencies in package Cargo.toml files.

---

## The 4-Section Structure

**Every** package Cargo.toml must organize dependencies into exactly 4 sections:

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

### Section Order (Always)

1. **Public workspace dependencies** - Workspace crates in public API
2. **Public third-party dependencies** - External crates in public API
3. **Private workspace dependencies** - Workspace crates used internally
4. **Private third-party dependencies** - External crates used internally

### Empty Sections

**Keep section comments even when empty:**

```toml
[dependencies]
# Public workspace dependencies

# Public third-party dependencies
serde = { workspace = true, public = true }

# Private workspace dependencies

# Private third-party dependencies
tracing = { workspace = true }
```

See [hashql-core/Cargo.toml](../../../../libs/@local/hashql/core/Cargo.toml) for example.

---

## Public vs Private Dependencies

### What is `public = true`?

Use `public = true` when a dependency appears in your **public API**:

- Return types in public functions
- Public struct fields
- Re-exported types
- Generic trait bounds on public items

### When to Use `public = true`

✅ **Use public = true:**

```rust
// Dependency appears in public signature
pub fn get_entity() -> EntityType { ... }  // EntityType = public

// Dependency in public struct field
pub struct Store {
    pub entities: Vec<EntityType>,  // EntityType = public
}

// Re-exported
pub use serde::Serialize;  // serde = public
```

❌ **Don't use public = true:**

```rust
// Only used internally
fn internal_helper() -> EntityType { ... }  // EntityType can be private

// Private field
pub struct Store {
    entities: Vec<EntityType>,  // EntityType can be private (private field)
}

// Only used in function bodies
pub fn process() {
    let data = serde_json::to_string(&x);  // serde_json can be private
}
```

### Public Dependency Examples

```toml
[dependencies]
# Public - these appear in public API
serde      = { workspace = true, public = true }
tokio      = { workspace = true, public = true }
hash-codec = { workspace = true, public = true }

# Private - only used internally
tracing = { workspace = true }
regex   = { workspace = true }
```

---

## Adding Dependencies

### Step 1: Determine Section

Ask yourself:

1. **Is it a workspace member or external crate?**
2. **Does it appear in my public API?**

This gives you one of 4 sections:

- Public + workspace → Section 1
- Public + external → Section 2
- Private + workspace → Section 3
- Private + external → Section 4

### Step 2: Add to Appropriate Section

```toml
[dependencies]
# Public workspace dependencies
my-workspace-crate = { workspace = true, public = true }

# Public third-party dependencies
serde = { workspace = true, public = true, features = ["derive"] }

# Private workspace dependencies
error-stack = { workspace = true }

# Private third-party dependencies
tracing = { workspace = true }
```

### Step 3: Add Features (if needed)

```toml
# Enable specific features
tokio = { workspace = true, features = ["rt-multi-thread", "macros", "signal"] }
serde = { workspace = true, public = true, features = ["derive"] }
```

---

## Alignment and Formatting

Align `=` signs within each section for readability:

### Good Alignment

```toml
# Public workspace dependencies
hash-graph-types      = { workspace = true, public = true }
hashql-core           = { workspace = true, public = true }
hashql-diagnostics    = { workspace = true, public = true }

# Public third-party dependencies
anstyle   = { workspace = true, public = true }
foldhash  = { workspace = true, public = true }
hashbrown = { workspace = true, public = true }
```

### Bad Alignment

```toml
# Don't do this
hash-graph-types = { workspace = true, public = true }
hashql-core = { workspace = true, public = true }
hashql-diagnostics = { workspace = true, public = true }
```

Use spaces (not tabs) to align the `=` within each section.

---

## Features Configuration

### Enabling Features

```toml
[dependencies]
# Enable specific features needed by this package
tokio = { workspace = true, features = ["rt-multi-thread", "macros"] }
serde = { workspace = true, features = ["derive"] }
```

### Feature Dependencies

Features can depend on other features:

```toml
[features]
default = ["std"]
std = ["serde/std", "dep:tokio"]
```

---

## Optional Dependencies

For conditional compilation:

```toml
[dependencies]
# Optional dependencies
serde = { workspace = true, optional = true, features = ["derive"] }
tokio = { workspace = true, optional = true }

[features]
# Activate optional dependencies via features
serde = ["dep:serde"]
async = ["dep:tokio", "tokio/rt"]
```

**Note:** Optional dependencies still follow the 4-section structure.

---

## dev-dependencies

Dev dependencies don't need the 4-section structure:

```toml
[dev-dependencies]
insta         = { workspace = true }
proptest      = { workspace = true }
rstest        = { workspace = true }
test-strategy = { workspace = true }
```

Just list them alphabetically, all with `workspace = true`.

---

## Common Patterns

### Adding a Workspace Member (Public)

```toml
[dependencies]
# Public workspace dependencies
my-crate = { workspace = true, public = true }
```

### Adding External Crate (Private)

```toml
[dependencies]
# Private third-party dependencies
regex = { workspace = true }
```

### Adding with Features

```toml
[dependencies]
# Private third-party dependencies
tokio = { workspace = true, features = ["rt-multi-thread", "macros"] }
```

### Optional + Public

```toml
[dependencies]
# Public third-party dependencies
serde = { workspace = true, public = true, optional = true, features = ["derive"] }

[features]
serde = ["dep:serde"]
```

---

## Related

- [workspace-setup.md](workspace-setup.md) - Adding to workspace root
- [examples-reference.md](examples-reference.md) - Real examples from HASH
- [SKILL.md](../SKILL.md) - Overview and quick reference
