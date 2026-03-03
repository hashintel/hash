# HashQL Diagnostic Writing Guidelines

This guide provides standards for creating high-quality diagnostics using the `hashql-diagnostics` crate.

## Table of Contents

1. [Philosophy](#philosophy)
2. [Diagnostic Structure](#diagnostic-structure)
3. [Message Style Guide](#message-style-guide)
4. [Severity Levels](#severity-levels)
5. [Span Selection](#span-selection)
6. [Category Design](#category-design)
7. [Labels](#labels)
8. [Help and Note Messages](#help-and-note-messages)
9. [Suggestions and Patches](#suggestions-and-patches)
10. [Testing Diagnostics](#testing-diagnostics)
11. [Review Checklist](#review-checklist)

## Philosophy

HashQL diagnostics should **be helpful, not just correct**. Every diagnostic is an opportunity to teach users about HashQL and guide them toward working solutions.

### Core Principles

1. **Clarity over cleverness**: Write as if explaining to a tired programmer
2. **Actionable guidance**: Always suggest what to do, not just what's wrong
3. **Context awareness**: Provide enough background for users to understand why something is problematic
4. **Matter-of-fact tone**: Be direct and helpful without apology or hedging
5. **Concise**: Users will see these messages repeatedly; respect their time

## Diagnostic Structure

Every diagnostic is built using the builder pattern:

```rust
use hashql_diagnostics::{Diagnostic, Label, Message, Severity};

// Step 1: Create diagnostic header with category and severity
// Step 2: Add primary label to complete the diagnostic
let mut diagnostic = Diagnostic::new(category, Severity::Error)
    .primary(Label::new(span, "expected `bool`, found `String`"));

// Step 3: Add secondary labels for context
diagnostic.add_label(Label::new(other_span, "expected because of this"));

// Step 4: Add help/note messages
diagnostic.add_message(Message::help("try using a comparison like `name == \"expected\"`"));
```

A complete diagnostic tells a story:

1. **What** went wrong (primary label message)
2. **Where** it occurred (primary label span)
3. **Why** it's problematic (secondary labels and note messages)
4. **How** to fix it (help messages and suggestions)

## Message Style Guide

### Core Rules

| Rule                        | Example                                                   |
| --------------------------- | --------------------------------------------------------- |
| Start with lowercase        | `"expected semicolon"` not `"Expected semicolon"`         |
| No trailing punctuation     | `"missing field"` not `"missing field."`                  |
| Use backticks for code      | `"expected \`bool\`, found \`String\`"`                   |
| Use "invalid" not "illegal" | `"invalid identifier"` not `"illegal identifier"`         |
| Be matter-of-fact           | `"type mismatch"` not `"sorry, types don't match"`        |
| Be specific                 | `"cannot find variable \`x\`"` not `"variable not found"` |

### Good vs Bad Messages

```rust
// ✅ Good messages
"cannot find variable `user_name` in this scope"
"expected `;` after expression"
"expected `bool`, found `String`"
"the identifier `foo.bar` is invalid"
"recursive type `List` has infinite size"

// ❌ Bad messages
"Error: variable not found."          // capitalized, has punctuation
"Sorry, there's a type mismatch here" // apologetic, not specific
"Illegal variable name"               // uses "illegal"
"Something went wrong"                // too vague
"Type error occurred"                 // not actionable
```

### Multi-sentence Messages

Avoid multi-sentence labels. If unavoidable, use proper punctuation:

```rust
Label::new(span,
    "cannot move out of borrowed content. Consider cloning the data instead.")
```

Help and note messages may use multiple sentences when it improves clarity.

### Code References

Always use backticks when referring to code elements:

```rust
// ✅ Correct
"cannot find variable `count` in this scope"
"expected type `String`, found `i32`"
"function `calculate` expects 2 arguments, found 3"

// ❌ Incorrect
"cannot find variable count in this scope"
"expected type String, found i32"
```

## Severity Levels

| Severity  | Code | When to Use                                                | Color  |
| --------- | ---- | ---------------------------------------------------------- | ------ |
| `Bug`     | 600  | Internal compiler error - indicates a bug in HashQL itself | Red    |
| `Fatal`   | 500  | Unrecoverable error preventing further processing          | Red    |
| `Error`   | 400  | Code cannot compile - must be fixed                        | Red    |
| `Warning` | 300  | Suspicious code that should be reviewed                    | Yellow |
| `Note`    | 200  | Informational context                                      | Purple |
| `Debug`   | 100  | Low-level compiler information                             | Blue   |

**Critical** severities (code ≥ 400) prevent compilation. **Advisory** severities (code < 400) allow compilation to continue.

```rust
use hashql_diagnostics::{Severity, severity::SeverityKind};

// Check severity type
if severity.is_critical() {
    // Bug, Fatal, or Error
}
if severity.is_advisory() {
    // Warning, Note, or Debug
}
```

### Severity Examples

```rust
// Bug - compiler issue, not user's fault
Diagnostic::new(category, Severity::Bug)
    .primary(Label::new(span, "internal error: cannot infer type"))

// Error - user must fix this
Diagnostic::new(category, Severity::Error)
    .primary(Label::new(span, "expected `bool`, found `String`"))

// Warning - potential issue
Diagnostic::new(category, Severity::Warning)
    .primary(Label::new(span, "unused variable `count`"))
```

## Span Selection

Choosing the right span is crucial. Poor span selection makes even well-written messages confusing.

### Principles

**Point to the cause, not the effect:**

```rust
// ✅ Points to the undefined variable
Label::new(var_use_span, "cannot find variable `count`")

// ❌ Points to the broader expression that fails
Label::new(entire_expr_span, "cannot find variable `count`")
```

**Use the smallest meaningful span:**

```rust
// ✅ Just the problematic field name
Label::new(field_name_span, "unknown field `naem`")

// ❌ Includes unnecessary context
Label::new(entire_struct_span, "unknown field `naem`")
```

**Don't span across logical boundaries:**

```rust
// ✅ Separate spans for different concepts
primary: Label::new(value_span, "expected `i32`, found `String`")
secondary: Label::new(type_decl_span, "expected because of this type")

// ❌ Huge span crossing multiple constructs
Label::new(multi_line_span, "type mismatch somewhere in here")
```

### Span Patterns by Error Type

**Type errors:** Point to the value with the wrong type, add context showing where the expectation comes from.

**Name resolution errors:** Point to the unresolved name, optionally point to similar names.

**Syntax errors:** Point to where the expected token should appear.

## Category Design

Categories form a hierarchy identifying the type of issue. Use `TerminalDiagnosticCategory` for simple cases:

```rust
use hashql_diagnostics::category::TerminalDiagnosticCategory;

const TYPE_MISMATCH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "type-mismatch",
    name: "Type Mismatch",
};

const UNDEFINED_VARIABLE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "undefined-variable",
    name: "Undefined Variable",
};
```

For hierarchical categories, implement `DiagnosticCategory`:

```rust
use std::borrow::Cow;
use hashql_diagnostics::category::DiagnosticCategory;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum TypeCheckCategory {
    TypeMismatch,
    UndefinedVariable,
}

impl DiagnosticCategory for TypeCheckCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("type-check")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Type Checker")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::TypeMismatch => Some(&TYPE_MISMATCH),
            Self::UndefinedVariable => Some(&UNDEFINED_VARIABLE),
        }
    }
}
```

### Context-Sensitive Categories

When category names need runtime information:

```rust
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum VariableCategory<'heap> {
    Undefined(Symbol<'heap>),
    Ambiguous(Symbol<'heap>),
}

impl<'heap> DiagnosticCategory for VariableCategory<'heap> {
    fn id(&self) -> Cow<'_, str> {
        match self {
            Self::Undefined(_) => Cow::Borrowed("undefined-variable"),
            Self::Ambiguous(_) => Cow::Borrowed("ambiguous-variable"),
        }
    }

    fn name(&self) -> Cow<'_, str> {
        match self {
            Self::Undefined(var) => Cow::Owned(format!("Undefined Variable `{var}`")),
            Self::Ambiguous(var) => Cow::Owned(format!("Ambiguous Variable `{var}`")),
        }
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        None
    }
}
```

## Labels

### Primary Labels

Every diagnostic has exactly one primary label - the main focus of the issue:

```rust
// Created via .primary() - this IS the primary label
let diagnostic = Diagnostic::new(category, Severity::Error)
    .primary(Label::new(span, "expected `bool`, found `String`"));
```

Primary labels should be self-contained and understandable without additional context.

### Secondary Labels

Add context without repeating the main message:

```rust
let mut diagnostic = Diagnostic::new(category, Severity::Error)
    .primary(Label::new(error_span, "cannot find variable `x`"));

// Add helpful context
diagnostic.add_label(Label::new(similar_var_span, "a similar variable exists here"));
diagnostic.add_label(Label::new(scope_start, "`y` is defined in this scope"));
```

### Label Guidelines

- **Primary label**: Self-contained, states the core issue
- **Secondary labels**: Provide context, don't repeat primary
- **Limit to 3-4 labels total** to avoid clutter
- **Order chronologically** when showing a sequence of events

### Highlighting

Use highlighting for visual emphasis on critical spans:

```rust
let highlighted = Label::new(span, "critical issue here")
    .with_highlight(true);
diagnostic.add_label(highlighted);
```

## Help and Note Messages

### Help Messages

Provide **actionable guidance** using imperative statements:

```rust
// ✅ Good help messages
diagnostic.add_message(Message::help("add type annotations to the parameters"));
diagnostic.add_message(Message::help("try using `.to_string()` to convert"));
diagnostic.add_message(Message::help("consider using a `match` expression"));

// ❌ Bad help messages
diagnostic.add_message(Message::help("You should add type annotations.")); // capitalized
diagnostic.add_message(Message::help("Maybe try something different")); // vague
```

### Note Messages

Provide **background context** and explanations:

```rust
// ✅ Good note messages
diagnostic.add_message(Message::note("variables must be declared before use"));
diagnostic.add_message(Message::note("this error originates in the macro `vec!`"));
diagnostic.add_message(Message::note("`String` and `bool` are incompatible types"));
```

### Help vs Note

- **Help**: Actionable advice ("add X", "try Y", "consider Z")
- **Note**: Context and explanation ("X requires Y", "this happens because Z")

### Styling Messages

```rust
use hashql_diagnostics::color::{AnsiColor, Color};

let styled = Message::help("important suggestion")
    .with_color(Color::Ansi(AnsiColor::Green));
diagnostic.add_message(styled);
```

## Suggestions and Patches

Suggestions provide concrete code fixes that can be applied automatically.

### When to Use Suggestions

**Good candidates:**

- Simple typos: `calcuate` → `calculate`
- Missing punctuation: add `;` or `,`
- Simple conversions: `.to_string()`, `.into()`
- Missing imports

**Poor candidates:**

- Complex refactoring
- Design decisions with multiple valid options
- Context-dependent fixes

### Creating Suggestions

**Single patch:**

```rust
use hashql_diagnostics::{Message, Patch, Suggestions};

let suggestion = Suggestions::patch(Patch::new(span, "corrected_code"));
diagnostic.add_message(
    Message::help("fix the typo").with_suggestions(suggestion)
);
```

**Multiple related patches:**

```rust
let mut suggestion = Suggestions::patch(Patch::new(import_span, "use std::collections::HashMap;\n"));
suggestion.push(Patch::new(usage_span, "HashMap::new()"));

diagnostic.add_message(
    Message::help("add the missing import").with_suggestions(suggestion)
);
```

**With explanation:**

```rust
let suggestion = Suggestions::patch(Patch::new(span, ".to_string()"))
    .with_trailer("this converts the value to a String");

diagnostic.add_message(
    Message::help("convert to string").with_suggestions(suggestion)
);
```

### "Did You Mean?" Suggestions

For typos and misspelled identifiers, use `hashql_core::algorithms::did_you_mean` to find similar candidates:

```rust
use hashql_core::algorithms::did_you_mean;
use hashql_diagnostics::{Diagnostic, Label, Message, Patch, Severity, Suggestions};

fn undefined_variable_error<'heap>(
    var_name: Symbol<'heap>,
    span: SpanId,
    available_variables: &[Symbol<'heap>],
) -> Diagnostic<Category, SpanId> {
    let mut diagnostic = Diagnostic::new(category, Severity::Error)
        .primary(Label::new(span, format!("cannot find variable `{var_name}`")));

    // Find similar variable names (top 3, using default adaptive cutoff)
    let similar = did_you_mean(var_name, available_variables, Some(3), None);

    if let Some(best_match) = similar.first() {
        let suggestion = Suggestions::patch(Patch::new(span, best_match.as_str()));
        diagnostic.add_message(
            Message::help(format!("a variable with a similar name exists: `{best_match}`"))
                .with_suggestions(suggestion)
        );
    }

    diagnostic
}
```

The `did_you_mean` function uses a three-tier matching strategy:

1. **Case-insensitive exact matches** (highest priority)
2. **Edit distance matching** using Damerau-Levenshtein with prefix/postfix weighting
3. **Word-based matching** for compound identifiers (e.g., `user_name` matches `user_data`)

Parameters:

- `lookup`: The symbol to find suggestions for
- `candidates`: Available symbols to match against
- `top_n`: Optional limit on results (e.g., `Some(3)` for top 3)
- `cutoff`: Optional similarity threshold (0.0-1.0). `None` uses an adaptive cutoff based on string length

### Suggestion Quality

- **Be minimal**: Change only what's necessary
- **Be correct**: Suggestions must produce valid code
- **Be specific**: One clear fix, not multiple alternatives in one suggestion

```rust
// ✅ Minimal, specific change
Patch::new(semicolon_span, ";")

// ❌ Changes more than necessary
Patch::new(entire_statement_span, "let x = 42;")
```

## Testing Diagnostics

HashQL uses compiletest for testing diagnostics. Every diagnostic should have test coverage with expected `.stderr` output. See the HashQL testing skill for details on writing compiletest tests.

## Review Checklist

### Message Quality

- [ ] Lowercase start (unless code identifier)
- [ ] No trailing punctuation (unless multi-sentence)
- [ ] Code elements in backticks
- [ ] Uses "invalid" not "illegal"
- [ ] Matter-of-fact tone (no apologies)
- [ ] Specific and actionable

### Content Quality

- [ ] Primary label is self-contained
- [ ] Secondary labels add context, don't repeat
- [ ] Help messages are actionable imperatives
- [ ] Note messages provide useful context
- [ ] Appropriate severity level

### Technical Accuracy

- [ ] Spans point to the actual problem location
- [ ] Spans are minimal (smallest meaningful range)
- [ ] Suggestions produce valid code
- [ ] Category matches the error type

### Testing

- [ ] Diagnostic has compiletest coverage
- [ ] `.stderr` file matches actual output

## Common Anti-Patterns

### Don't Do This

```rust
// ❌ Capitalized with punctuation
Label::new(span, "Error occurred here.")

// ❌ Capitalized start
Label::new(span, "This is of type `String`")

// ❌ Too verbose
Label::new(span, "this expression has a type that doesn't match what was expected")

// ❌ Apologetic
Message::help("Sorry, you need to fix the type mismatch")

// ❌ Vague suggestion
Message::help("did you mean this?")
```

### Do This Instead

```rust
// ✅ Lowercase, no punctuation, concise
Label::new(span, "expected `bool`, found `String`")

// ✅ Specific and minimal
Label::new(span, "cannot find variable `count`")

// ✅ Direct and helpful
Message::help("add type annotations to resolve this")

// ✅ Specific suggestion
Message::help("try using `calculate` instead")
```
