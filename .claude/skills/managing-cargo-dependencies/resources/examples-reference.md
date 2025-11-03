# Examples Reference

Real examples from the HASH codebase demonstrating dependency patterns.

---

## Example 1: @local/codec

Complete example from [hash-codec/Cargo.toml](../../../../libs/@local/codec/Cargo.toml)

### Full Dependencies Section

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

# Private third-party dependencies
dashu-base     = { workspace = true, optional = true, features = ["std"] }
derive_more    = { workspace = true, optional = true, features = ["display", "error"] }
simple-mermaid = { workspace = true }
```

### Key Points

- ✅ All 4 section comments present (even when empty - line "Private workspace dependencies")
- ✅ `public = true` for dependencies exposed in public API (`bytes`, `uuid`)
- ✅ No `public = true` for internal dependencies (`simple-mermaid`)
- ✅ Alignment within each section
- ✅ Many `optional = true` dependencies activated via `[features]`

### Features Configuration

```toml
[features]
bytes = ["dep:bytes"]
serde = ["dep:serde_core", "dep:uuid", "uuid/serde"]
json = ["serde", "serde_json"]
```

---

## Example 2: @local/hashql/core

Complete example from [hashql-core/Cargo.toml](../../../../libs/@local/hashql/core/Cargo.toml)

### Full Dependencies Section

```toml
[dependencies]
# Public workspace dependencies
hash-graph-types      = { workspace = true, public = true }
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

### Key Points

- ✅ Empty "Private workspace dependencies" section kept
- ✅ Public workspace crates (`hash-graph-types`, `hashql-diagnostics`)
- ✅ Public third-party crates (`anstyle`, `foldhash`, `hashbrown`)
- ✅ Features specified at package level (`bitvec`, `derive_more`)
- ✅ Perfect alignment

---

## Example 3: Typical Backend Service

Pattern for a backend service package:

```toml
[dependencies]
# Public workspace dependencies
hash-graph-types = { workspace = true, public = true }
error-stack      = { workspace = true, public = true }

# Public third-party dependencies
serde = { workspace = true, public = true, features = ["derive"] }
tokio = { workspace = true, public = true }

# Private workspace dependencies
hash-codec = { workspace = true }

# Private third-party dependencies
tracing       = { workspace = true }
regex         = { workspace = true }
serde_json    = { workspace = true }
tokio-util    = { workspace = true, features = ["codec"] }
derive_more   = { workspace = true, features = ["debug", "display", "from"] }
```

---

## Example 4: dev-dependencies

Dev dependencies don't need 4-section structure:

```toml
[dev-dependencies]
insta              = { workspace = true }
proptest           = { workspace = true }
rstest             = { workspace = true }
test-strategy      = { workspace = true }
tokio              = { workspace = true, features = ["test-util"] }
```

**Note:** Can add features to dev-dependencies for testing.

---

## Example 5: Optional Dependencies Pattern

Full pattern with optional dependencies:

```toml
[dependencies]
# Public workspace dependencies
error-stack = { workspace = true, public = true, optional = true }

# Public third-party dependencies
serde = { workspace = true, public = true, optional = true, features = ["derive"] }

# Private workspace dependencies

# Private third-party dependencies
tracing = { workspace = true }

[features]
default = []
serde = ["dep:serde", "error-stack/serde"]
std = ["error-stack/std"]
```

---

## Example 6: Feature-Rich Dependency

When a dependency needs many features:

```toml
[dependencies]
# Private third-party dependencies
tokio = {
    workspace = true,
    features = [
        "rt-multi-thread",
        "macros",
        "signal",
        "sync",
        "time",
        "fs",
        "io-util",
    ],
}
```

**Note:** Multi-line format when feature list is long.

---

## Example 7: Workspace Member Reference

Adding a new workspace member:

```toml
# In workspace root Cargo.toml
[workspace.dependencies]
my-new-crate.path = "libs/@local/my-new-crate"

# In package Cargo.toml
[dependencies]
# Public workspace dependencies
my-new-crate = { workspace = true, public = true }
```

---

## Anti-Patterns to Avoid

### ❌ Version in Package

```toml
# WRONG - version should be in workspace root only
[dependencies]
serde = { version = "1.0.228", features = ["derive"] }
```

### ❌ Exact Pinning in Workspace

```toml
# WRONG - use caret versions, let Cargo.lock handle exact pinning
[workspace.dependencies]
serde = { version = "=1.0.228", default-features = false }
```

### ❌ Missing Section Comments

```toml
# WRONG - missing section structure
[dependencies]
serde = { workspace = true, public = true }
tokio = { workspace = true, public = true }
tracing = { workspace = true }
```

### ❌ Wrong Section

```toml
# WRONG - serde should be in "Public third-party"
[dependencies]
# Private third-party dependencies
serde = { workspace = true, public = true }
```

### ❌ No Alignment

```toml
# WRONG - inconsistent spacing
hash-graph-types = { workspace = true, public = true }
hashql-core = { workspace = true, public = true }
```

---

## Quick Checklist

When reviewing Cargo.toml:

- [ ] All 4 section comments present (even if empty)
- [ ] Dependencies in correct section (public/private, workspace/third-party)
- [ ] `public = true` for all public API dependencies
- [ ] `workspace = true` for all dependencies
- [ ] Alignment within each section
- [ ] No version numbers in package Cargo.toml
- [ ] Features specified at package level (not workspace)

---

## Related

- [workspace-setup.md](workspace-setup.md) - Managing workspace root
- [package-dependencies.md](package-dependencies.md) - Section structure details
- [SKILL.md](../SKILL.md) - Overview and quick reference
