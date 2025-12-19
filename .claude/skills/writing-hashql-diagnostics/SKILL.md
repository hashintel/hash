---
name: writing-hashql-diagnostics
description: HashQL diagnostic writing patterns using hashql-diagnostics crate. Use when creating error messages, warnings, Labels, Messages, Severity levels, Patches, Suggestions, or improving diagnostic quality in HashQL code.
license: AGPL-3.0
metadata:
  triggers:
    type: domain
    enforcement: suggest
    priority: high
    keywords:
      - diagnostic
      - hashql-diagnostics
      - Label
      - Message
      - Severity
      - Patch
      - Suggestions
    intent-patterns:
      - "\\b(create|write|add|improve)\\b.*?\\bdiagnostic\\b"
      - "\\b(error|warning)\\b.*?\\bmessage\\b"
---

# HashQL Diagnostic Writing

Provides HASH-specific patterns for writing high-quality diagnostics using the `hashql-diagnostics` crate, ensuring messages are helpful, actionable, and follow consistent style conventions.

## Core Principles

**Diagnostics should be helpful, not just correct:**

✅ **DO:**

- Start messages with lowercase
- Use backticks for code elements: `` expected `bool`, found `String` ``
- Make messages actionable and specific
- Use "invalid" not "illegal"
- Keep help messages as imperatives: "add type annotations"

❌ **DON'T:**

- End messages with punctuation (unless multi-sentence)
- Use apologetic language ("sorry", "unfortunately")
- Write vague messages ("something went wrong")
- Capitalize message starts (unless code identifier)

## Quick Reference

### Creating a Diagnostic

```rust
use hashql_diagnostics::{Diagnostic, Label, Message, Severity};

let mut diagnostic = Diagnostic::new(category, Severity::Error)
    .primary(Label::new(span, "expected `bool`, found `String`"));

diagnostic.add_label(Label::new(other_span, "expected because of this"));
diagnostic.add_message(Message::help("try using a comparison"));
```

### Severity Levels

| Severity   | When to Use                |
| ---------- | -------------------------- |
| `Bug`      | Internal compiler error    |
| `Fatal`    | Unrecoverable error        |
| `Error`    | Must be fixed to compile   |
| `Warning`  | Suspicious code to review  |
| `Note`     | Informational context      |

### Message Style

```rust
// ✅ Good
"cannot find variable `count` in this scope"
"expected `;` after expression"

// ❌ Bad
"Error: Variable not found."  // capitalized, punctuation
"Sorry, there's a type mismatch"  // apologetic
```

### Adding Suggestions

```rust
use hashql_diagnostics::{Message, Patch, Suggestions};

let suggestion = Suggestions::patch(Patch::new(span, "corrected_code"));
diagnostic.add_message(
    Message::help("fix the typo").with_suggestions(suggestion)
);
```

## References

- [Comprehensive guidelines](references/guidelines.md) - Complete message style guide, span selection, category design, label usage, help vs note, suggestion quality, review checklist
- [HashQL testing skill](../testing-hashql/SKILL.md) - For compiletest coverage
