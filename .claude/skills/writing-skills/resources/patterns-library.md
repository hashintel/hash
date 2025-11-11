# Common Patterns Library for HASH Skills

Ready-to-use regex and glob patterns for skill triggers in HASH repository. Copy and customize for your skills.

---

## Intent Patterns (Regex)

### Rust Error Handling

```regex
(handle|create|define|propagate).*?error
(error|errors).*?(handling|propagation|definition|documentation)
Result.*?Report
```

### Cargo/Dependencies

```regex
(add|create|update|modify).*?(dependency|dependencies|crate)
(cargo|Cargo\.toml).*?(dependency|dependencies)
workspace.*?dependency
```

### Feature/Endpoint Creation

```regex
(add|create|implement|build).*?(feature|endpoint|route|service|API)
```

### Component Creation (Frontend)

```regex
(create|add|make|build).*?(component|UI|page|modal|dialog|form)
```

### Database/Graph Work

```regex
(add|create|modify|update).*?(entity|type|property|table|migration)
(database|graph|temporal).*?(change|update|query)
```

### Error Handling (General)

```regex
(fix|handle|catch|debug).*?(error|exception|bug)
(add|implement).*?(error.*?handling)
```

### Explanation Requests

```regex
(how does|how do|explain|what is|describe|tell me about).*?
```

### Workflow Operations

```regex
(create|add|modify|update).*?(workflow|step|branch|condition)
(debug|troubleshoot|fix).*?workflow
```

### Testing

```regex
(write|create|add).*?(test|spec|unit.*?test)
```

---

## File Path Patterns (Glob)

Based on HASH repository structure (from `.github/labeler.yml`):

### Rust Code

```glob
**/*.rs                     # All Rust files
**/Cargo.toml              # Cargo manifest files
**/Cargo.lock              # Cargo lock files
```

### HASH Apps

```glob
apps/hash-*/**             # All HASH apps
apps/hash-api/**           # Backend API
apps/hash-graph/**         # Graph database (Rust)
apps/hash-frontend/**      # Web frontend
libs/@local/hash-*/**      # Local HASH libs
```

### Frontend

```glob
apps/hash-frontend/**/*.tsx        # React components
apps/hash-frontend/**/*.ts         # TypeScript files
libs/@hashintel/**                 # HASH-specific frontend libs
libs/@hashintel/ds-*/**           # Design system
**/*.stories.tsx                   # Storybook stories
**/.storybook/**                   # Storybook config
```

### Backend

```glob
apps/hash-graph/**         # Graph service
apps/hash-api/**           # API service
libs/@local/**             # Local backend libs
```

### Libraries

```glob
libs/**                    # All libs
libs/@local/**             # Local monorepo libs
libs/@hashintel/**         # HASH-specific libs
libs/@blockprotocol/**     # Block Protocol libs
libs/error-stack/**        # error-stack crate
```

### Blocks

```glob
blocks/**                  # All Block Protocol blocks
```

### Infrastructure

```glob
infra/**                   # All infrastructure
infra/terraform/**         # Terraform configs
infra/docker/**            # Docker configs
```

### Tests

```glob
tests/**                            # All tests
tests/hash-backend-integration/**  # Backend integration
tests/hash-graph-integration/**    # Graph integration
tests/hash-playwright/**            # Playwright E2E
**/tests/**                         # Test directories
**/test/**                          # Test directories
**/*.test.ts                        # TypeScript tests
**/*.test.tsx                       # React tests
**/*.test.rs                        # Rust tests
```

---

## Content Patterns (Regex)

### Rust Error Handling (error-stack)

```regex
Result<                         # Result types
Report<                         # error-stack Report
\\.attach                       # attach() method
\\.change_context              # change_context() method
error_stack::                   # error-stack imports
impl.*Error for                 # Error trait implementations
```

### Cargo Dependencies

```regex
\\[dependencies\\]             # Dependencies section
\\[dev-dependencies\\]         # Dev dependencies
workspace = true                # Workspace dependencies
public = true                   # Public dependencies (cargo-public-api)
```

### TypeScript/React

```regex
export.*React\\.FC             # React functional components
export default function.*       # Default function exports
useState|useEffect|useMemo      # React hooks
import.*@hashintel              # HASH-specific imports
import.*@blockprotocol          # Block Protocol imports
```

### Graph/Temporal Types

```regex
Entity(Type|Properties)         # Entity types
TemporalAxes                    # Temporal data structures
EntityStore                     # Graph store operations
```

### Error Handling (TypeScript)

```regex
try\\s*\\{                     # Try blocks
catch\\s*\\(                   # Catch blocks
throw new                       # Throw statements
```

---

**Usage Example:**

```json
{
  "my-skill": {
    "promptTriggers": {
      "intentPatterns": [
        "(create|add|build).*?(component|UI|page)"
      ]
    },
    "fileTriggers": {
      "pathPatterns": [
        "frontend/src/**/*.tsx"
      ],
      "contentPatterns": [
        "export.*React\\.FC",
        "useState|useEffect"
      ]
    }
  }
}
```

---

**Related Files:**

- [SKILL.md](../SKILL.md) - Main skill guide
- [trigger-types.md](trigger-types.md) - Detailed trigger documentation
- [skill-rules-reference.md](skill-rules-reference.md) - Complete schema
