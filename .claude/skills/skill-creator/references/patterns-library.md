# Common Patterns Library

Ready-to-use regex and glob patterns for skill triggers. Copy and customize for your skills.

## Intent Patterns (Regex)

Use in `metadata.triggers.intentPatterns`. Remember to escape backslashes in YAML (`\\b` not `\b`).

### Error Handling

```regex
(handle|create|define|propagate).*?error
(error|errors).*?(handling|propagation|definition|documentation)
Result.*?Report
(fix|handle|catch|debug).*?(error|exception|bug)
```

### Dependencies/Package Management

```regex
(add|create|update|modify).*?(dependency|dependencies|crate|package)
(cargo|npm|yarn|pip).*?(dependency|dependencies|install)
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

### Database/Schema Work

```regex
(add|create|modify|update).*?(entity|type|property|table|migration|schema)
(database|graph|sql).*?(change|update|query)
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
(write|create|add|run).*?(test|spec|unit.*?test)
```

## File Path Patterns (Glob)

Use in `metadata.triggers.fileTriggers.pathPatterns`.

### By Language

```glob
**/*.rs                     # All Rust files
**/*.ts                     # All TypeScript files
**/*.tsx                    # All React/TSX files
**/*.py                     # All Python files
**/*.go                     # All Go files
```

### By Location

```glob
src/**/*.ts                 # Source files
lib/**/*.ts                 # Library files
apps/**/*                   # Application code
libs/**/*                   # Shared libraries
```

### Test Exclusions

Use in `metadata.triggers.fileTriggers.pathExclusions`:

```glob
**/*.test.ts                # TypeScript tests
**/*.test.tsx               # React tests
**/*.spec.ts                # Spec files
**/*.test.rs                # Rust tests
**/tests/**                 # Test directories
**/test/**                  # Test directories
**/__tests__/**             # Jest test directories
```

### Configuration Files

```glob
**/Cargo.toml               # Rust manifest
**/package.json             # Node manifest
**/tsconfig.json            # TypeScript config
**/*.config.js              # Config files
```

## Content Patterns (Regex)

Use in `metadata.triggers.fileTriggers.contentPatterns`. These match against file contents.

### Rust

```regex
Result<                         # Result types
Report<                         # error-stack Report
\\.attach                       # attach() method
\\.change_context              # change_context() method
use error_stack                 # error-stack imports
impl.*Error for                 # Error trait implementations
```

### TypeScript/React

```regex
export.*React\\.FC             # React functional components
export default function.*       # Default function exports
useState|useEffect|useMemo      # React hooks
import.*from                    # ES imports
```

### Error Handling

```regex
try\\s*\\{                     # Try blocks
catch\\s*\\(                   # Catch blocks
throw new                       # Throw statements
```

## Example Usage

```yaml
metadata:
  triggers:
    type: domain
    enforcement: suggest
    priority: high
    keywords:
      - error
      - error handling
    intentPatterns:
      - "\\b(handle|create|fix)\\b.*?\\berror\\b"
      - "\\berror\\b.*?\\b(handling|propagation)\\b"
    fileTriggers:
      pathPatterns:
        - "**/*.rs"
      pathExclusions:
        - "**/*.test.rs"
      contentPatterns:
        - "Result<"
        - "Report<"
```

## Best Practices

### DO:

- Use `\\b` for word boundaries (prevents partial matches)
- Use `.*?` for non-greedy matching (faster, more precise)
- Escape special regex characters: `\\.` for literal dot
- Test patterns at https://regex101.com/
- Start specific, broaden if needed

### DON'T:

- Use overly generic keywords ("system", "work", "create" alone)
- Make patterns too broad (causes false positives)
- Use greedy `.*` instead of non-greedy `.*?`
- Forget to escape backslashes in YAML (use `\\b` not `\b`)
