# HashQL Diagnostic Writing Guidelines

This guide provides comprehensive standards for creating high-quality diagnostics using the `hashql-diagnostics` crate, following proven compiler diagnostic style conventions.

## Table of Contents

1. [Philosophy](#philosophy)
2. [Diagnostic Structure](#diagnostic-structure)
3. [Message Style Guide](#message-style-guide)
4. [Severity Levels](#severity-levels)
5. [Span Selection Guide](#span-selection-guide)
6. [Category Design](#category-design)
7. [Label Best Practices](#label-best-practices)
8. [Help and Note Messages](#help-and-note-messages)
9. [Suggestions System](#suggestions-system)
10. [Code Examples and Patterns](#code-examples-and-patterns)
11. [Testing with Compiletest](#testing-with-compiletest)
12. [Review Checklist](#review-checklist)
13. [Troubleshooting Guide](#troubleshooting-guide)

## Philosophy

HashQL diagnostics should **be helpful, not just correct**. Every diagnostic is an opportunity to teach users about HashQL and guide them toward working solutions. Our audience consists of general-purpose developers familiar with languages like Rust, TypeScript, or JavaScript, so we can assume familiarity with modern programming concepts while being clear about HashQL-specific behavior.

### Core Principles

1. **Clarity over Cleverness**: Write as if explaining to a tired programmer
2. **Actionable Guidance**: Always suggest what to do, not just what's wrong
3. **Context Awareness**: Provide enough background for users to understand why something is problematic
4. **Matter-of-fact tone**: Be direct and helpful without apology or hedging
5. **Leverage familiar patterns**: Use terminology and concepts familiar to modern developers

## Diagnostic Structure

Every diagnostic follows this structure:

```rust
// Category + Severity + Primary Label
let diagnostic = Diagnostic::new(category, severity).primary(primary_label);

// Secondary labels for context
diagnostic.labels.push(Label::new(context_span, "context message"));

// Help and note messages
diagnostic.add_message(Message::help("how to fix this"));
diagnostic.add_message(Message::note("why this matters"));
```

The diagnostic structure should tell a complete story:

1. **What** went wrong (primary message)
2. **Where** it occurred (spans and labels)
3. **Why** it's problematic (context and explanation)
4. **How** to fix it (suggestions and help)

## Message Style Guide

### Core Style Rules

Following established diagnostic style conventions:

1. **Start with lowercase** (unless proper noun or code identifier)
2. **No trailing punctuation** (unless multiple sentences are needed)
3. **Use backticks for code**: Variables, types, keywords should be in backticks
4. **Avoid "illegal"** - use "invalid" or more specific terms
5. **Be matter-of-fact** - don't apologize or hedge
6. **Use plain English** - understandable by any programmer
7. **Be succinct but clear** - users will see these messages repeatedly

### Examples

```rust
// ✅ Good messages (following established conventions)
"cannot find variable `user_name` in this scope"
"expected `;` after expression"
"mismatched types: expected `bool`, found `String`"
"the identifier `foo.bar` is invalid"
"recursive type `List` has infinite size"

// ❌ Bad messages (violate established conventions)
"Error: variable not found."          // Capitalized, has punctuation
"Sorry, there's a type mismatch here" // Apologetic, not specific
"Illegal variable name"               // Uses "illegal"
"Something went wrong"                // Too vague
"Type error occurred"                 // Not actionable
```

### Multi-sentence Messages

Avoid multi-sentence labels unless necessary, where they are unavoidable use proper punctuation. Messages can use multiple sentences, and are encouraged to do so where they enhance clarity and readability.

```rust
Label::new(span,
    "cannot move out of borrowed content. \
     Consider borrowing here or cloning the data.")
```

### Code and Identifiers

Always use backticks when referring to code elements:

```rust
// ✅ Correct
"cannot find variable `count` in this scope"
"expected type `String`, found `i32`"
"the function `calculate` expects 2 arguments, found 3"

// ❌ Incorrect
"cannot find variable count in this scope"
"expected type String, found i32"
```

## Severity Levels

### Bug (Internal Compiler Error)

- **When**: Compiler bug, should never happen with valid input
- **Code**: 600, **Color**: Red
- **Message style**: Focus on what failed internally

```rust
Diagnostic::new(category, Severity::Bug)
    .primary(Label::new(span, "cannot infer type of this expression"))
```

### Fatal

- **When**: Unrecoverable errors preventing further processing
- **Code**: 500, **Color**: Red

### Error

- **When**: Code cannot compile - MUST be fixed
- **Code**: 400, **Color**: Red
- **Message style**: State what's wrong and what was expected

```rust
Diagnostic::new(category, Severity::Error)
    .primary(Label::new(span, "mismatched types: expected `String`, found `i32`"))
```

### Warning

- **When**: Suspicious code that should be reviewed
- **Code**: 300, **Color**: Yellow
- **Message style**: Describe the potential issue

```rust
Diagnostic::new(category, Severity::Warning)
    .primary(Label::new(span, "unused variable: `count`"))
```

### Note & Debug

- **Note** (200, Purple): Informational context
- **Debug** (100, Blue): Low-level compiler information

## Span Selection Guide

Choosing the right spans is crucial for helpful diagnostics. Poor span selection can make even well-written messages confusing.

### Core Principles

**Point to the cause, not the effect:**

```rust
// ✅ Good - points to the undefined variable
Label::new(var_use_span, "cannot find variable `count`")

// ❌ Bad - points to the broader expression that fails
Label::new(entire_expr_span, "cannot find variable `count`")
```

**Use the smallest meaningful span:**

```rust
// ✅ Good - just the problematic part
Label::new(field_name_span, "unknown field `naem`")

// ❌ Bad - includes unnecessary context
Label::new(entire_struct_span, "unknown field `naem`")
```

**Avoid spanning across logical boundaries:**

```rust
// ✅ Good - separate spans for different concepts
primary_label: "expected `i32`, found `String`"
secondary_label: "this has type `String`"

// ❌ Bad - spans across multiple constructs  
Label::new(huge_span_crossing_lines, "type mismatch here")
```

### Span Selection Patterns

**For type errors:**

```rust
// Point to the value with the unexpected type
Label::new(value_span, "expected `bool`, found `String`")
// Add context about where the expectation comes from
Label::new(expectation_source_span, "expected `bool` because of this")
```

**For name resolution errors:**

```rust
// Point to the unresolved name
Label::new(name_span, "cannot find function `calcuate`")
// Point to similar names if available
Label::new(similar_name_span, "there is a function `calculate` here")
```

**For syntax errors:**

```rust
// Point to where the expected token should be
Label::new(insertion_point, "expected `;`")
// Point to the construct that requires it
Label::new(statement_span, "statement ends here")
```

### When to Use Multiple Spans

Use multiple spans to tell a story across the code:

```rust
let mut diagnostic = Diagnostic::new(category, Severity::Error)
    .primary(Label::new(use_span, "variable `x` borrowed here after move"));

diagnostic.labels.push(Label::new(move_span, "value moved here"));
diagnostic.labels.push(Label::new(later_use_span, "move prevents later use"));
```

**Guidelines:**

- Primary span: The main problem location
- Secondary spans: Context that explains the problem
- Limit to 3-4 spans total to avoid clutter
- Order spans chronologically when possible

## Category Design

Categories use hierarchical subcategories with terminal diagnostics:

```rust
// Terminal categories for specific errors
const TYPE_MISMATCH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "type-mismatch",
    name: "Type Mismatch"
};

const UNDEFINED_VARIABLE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "undefined-variable",
    name: "Undefined Variable"
};

// Parent category enum
pub enum TypeCheckDiagnosticCategory {
    TypeMismatch,
    UndefinedVariable,
    CircularType,
}

impl DiagnosticCategory for TypeCheckDiagnosticCategory {
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
            // ... other variants
        }
    }
}
```

## Label Best Practices

### Primary Labels

Primary labels should be self-contained and follow Rust's style:

```rust
// ✅ Good - specific and follows established conventions
Label::new(span, "expected `bool`, found `String`")
Label::new(span, "cannot find variable `count` in this scope")
Label::new(span, "expected `;` after this expression")

// ❌ Bad - too vague or wrong style
Label::new(span, "error here")
Label::new(span, "Type mismatch.")  // Capitalized + punctuation
Label::new(span, "This is of type `String`")  // Not concise
```

### Secondary Labels

Provide context without repeating the main message:

```rust
let mut diagnostic = Diagnostic::new(category, Severity::Error)
    .primary(Label::new(error_span, "cannot find variable `x` in this scope"));

// Add helpful context
diagnostic.labels.push(Label::new(
    similar_var_span,
    "a variable with a similar name exists here"
));

diagnostic.labels.push(Label::new(
    scope_start,
    "variable `y` is defined here"
));
```

### Label Message Style

Labels should be concise and spatially aware:

```rust
// ✅ Good - concise, specific to the span
"expected `;`"
"undefined variable"
"this returns `i32`"

// ❌ Bad - too verbose for a label
"this expression returns an integer value of type i32"
"you need to add a semicolon here to complete the statement"
```

## Help and Note Messages

### Help Messages

Help messages provide **actionable guidance** using imperative statements:

```rust
// ✅ Good help messages (established style)
diagnostic.add_message(Message::help(
    "add type annotations to the function parameters"
));

diagnostic.add_message(Message::help(
    "consider using a `let` binding to create a longer lived value"
));

diagnostic.add_message(Message::help(
    "try using a conversion method, like `.to_string()` or `.into()`"
));

// ❌ Bad help messages
diagnostic.add_message(Message::help(
    "You should add type annotations to help the compiler."  // Capitalized
));

diagnostic.add_message(Message::help(
    "Maybe try using a different approach here"  // Not specific
));
```

### Note Messages

Note messages provide **background context** and explanations:

```rust
// ✅ Good note messages
diagnostic.add_message(Message::note(
    "variables must be declared before they can be used"
));

diagnostic.add_message(Message::note(
    "this error originates in the macro `vec!`"
));

diagnostic.add_message(Message::note(
    "for information about configuring hashql flags, see <link>"
));
```

### Help vs Note Guidelines

- **Help**: Use for actionable advice ("add type annotations", "consider using X")
- **Note**: Use for context, explanations, and additional information

## Suggestions System

The suggestions system allows providing concrete code fixes that tools can apply automatically or show to users.

### When to Provide Suggestions

**Good candidates for suggestions:**

- Simple typos: `calcuate` → `calculate`  
- Missing punctuation: Add `;` or `,`
- Common type conversions: `.to_string()`, `.into()`
- Import additions: `use std::collections::HashMap`

**Poor candidates for suggestions:**

- Complex refactoring spanning multiple functions
- Design decisions (which pattern to use)
- Context-dependent fixes where multiple options exist

### Types of Suggestions

**Single patch suggestions:**

```rust
// Simple fix with one code change
let suggestion = Suggestions::patch(Patch::new(span, "corrected_code"));
diagnostic.add_message(
    Message::help("fix the typo").with_suggestions(suggestion)
);
```

**Multi-patch suggestions:**

```rust
// Related changes that should be applied together
let mut suggestion = Suggestions::patch(Patch::new(import_span, "use std::collections::HashMap;\n"));
suggestion.push(Patch::new(usage_span, "HashMap::new()"));

diagnostic.add_message(
    Message::help("add the missing import").with_suggestions(suggestion)
);
```

**Suggestions with explanations:**

```rust
let suggestion = Suggestions::patch(Patch::new(span, ".to_string()"))
    .with_trailer("this converts the integer to a string");

diagnostic.add_message(
    Message::help("convert to string").with_suggestions(suggestion)
);
```

### Suggestion Quality Guidelines

**Be specific and minimal:**

```rust
// ✅ Good - specific change
Patch::new(span, ";")

// ❌ Bad - changes more than necessary  
Patch::new(large_span, "let x = 42;")
```

**Test suggestion applicability:**

```rust
// Always verify suggestions produce valid code
#[test]
fn test_suggestion_applies_correctly() {
    let original = "let x = 42";
    let patch = Patch::new(14..14, ";");
    let result = apply_patch(original, patch);
    assert_eq!(result, "let x = 42;");
    assert!(parses_successfully(result));
}
```

**Provide context when the fix isn't obvious:**

```rust
// When the suggestion needs explanation
let suggestion = Suggestions::patch(Patch::new(span, "Box::new(value)"))
    .with_trailer("boxing moves the value to the heap");
```

### "Did You Mean" Suggestions

For typos and similar names:

```rust
pub fn undefined_variable_with_suggestions(
    var_name: &str,
    span: SpanId,
    similar_names: Vec<String>,
) -> Diagnostic {
    let mut diagnostic = Diagnostic::new(category, Severity::Error)
        .primary(Label::new(span, format!("cannot find variable `{}`", var_name)));

    if !similar_names.is_empty() {
        // Create suggestions for the top candidates (max 4)
        let mut suggestions = Suggestions::patch(
            Patch::new(span, similar_names[0].clone())
        );
        
        for suggestion in similar_names.iter().skip(1).take(3) {
            suggestions.push(Patch::new(span, suggestion.clone()));
        }

        diagnostic.add_message(
            Message::help("you might have a typo in your variable name")
                .with_suggestions(suggestions)
        );

        // If there are more than 4 candidates, mention how many more
        if similar_names.len() > 4 {
            diagnostic.add_message(Message::note(
                format!("and {} other candidates", similar_names.len() - 4)
            ));
        }
    }

    diagnostic
}
```

**Unexpected token:**

```rust
pub fn unexpected_token_error(
    found_span: SpanId,
    found_token: &str,
    expected_tokens: Vec<&str>,
) -> ParseDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ParseDiagnosticCategory::UnexpectedToken,
        Severity::Error,
    ).primary(Label::new(
        found_span,
        if expected_tokens.len() == 1 {
            format!("expected `{}`, found `{}`", expected_tokens[0], found_token)
        } else {
            format!("unexpected token `{}`", found_token)
        }
    ));

    if expected_tokens.len() > 1 {
        diagnostic.add_message(Message::help(
            format!("expected one of: {}", 
                expected_tokens.iter()
                    .map(|t| format!("`{}`", t))
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        ));
    }

    diagnostic
}
```

### Import and Module Errors

**Unresolved import:**

```rust
pub fn unresolved_import_error(
    import_span: SpanId,
    module_name: &str,
    available_modules: Vec<String>,
) -> ImportDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ImportDiagnosticCategory::UnresolvedImport,
        Severity::Error,
    ).primary(Label::new(
        import_span,
        format!("cannot find module `{}`", module_name),
    ));

    // Suggest similar module names using proper suggestions
    let similar_modules = find_similar_names(module_name, &available_modules, 4);
    if !similar_modules.is_empty() {
        let mut suggestions = Suggestions::patch(
            Patch::new(import_span, similar_modules[0].clone())
        );
        
        for module in similar_modules.iter().skip(1) {
            suggestions.push(Patch::new(import_span, module.clone()));
        }

        diagnostic.add_message(
            Message::help("you might have a typo in your module name")
                .with_suggestions(suggestions)
        );

        if available_modules.len() > 4 {
            diagnostic.add_message(Message::note(
                format!("and {} other available modules", available_modules.len() - 4)
            ));
        }
    }

    diagnostic
}
```

### Query Analysis Errors

**Invalid operation:**

```rust
pub fn invalid_operation_error(
    operation_span: SpanId,
    operation: &str,
    operand_type: &str,
) -> QueryDiagnostic {
    let mut diagnostic = Diagnostic::new(
        QueryDiagnosticCategory::InvalidOperation,
        Severity::Error,
    ).primary(Label::new(
        operation_span,
        format!("cannot apply `{}` to type `{}`", operation, operand_type),
    ));

    // Suggest valid operations for this type
    let valid_ops = get_valid_operations_for_type(operand_type);
    if !valid_ops.is_empty() {
        diagnostic.add_message(Message::help(
            format!("valid operations for `{}`: {}", 
                operand_type,
                valid_ops.iter()
                    .map(|op| format!("`{}`", op))
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        ));
    }

    diagnostic
}
```

### Schema Validation Errors

**Field constraint violation:**

```rust
pub fn field_constraint_error(
    field_span: SpanId,
    field_name: &str,
    constraint: &str,
    actual_value: &str,
) -> SchemaDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SchemaDiagnosticCategory::ConstraintViolation,
        Severity::Error,
    ).primary(Label::new(
        field_span,
        format!("field `{}` violates constraint `{}`", field_name, constraint),
    ));

    diagnostic.add_message(Message::note(
        format!("field has value `{}` but constraint requires `{}`", 
            actual_value, constraint)
    ));

    // Suggest how to fix based on constraint type
    match constraint {
        c if c.starts_with("min:") => {
            diagnostic.add_message(Message::help("increase the value to meet the minimum"));
        }
        c if c.starts_with("max:") => {
            diagnostic.add_message(Message::help("decrease the value to meet the maximum"));  
        }
        _ => {
            diagnostic.add_message(Message::help("adjust the value to satisfy the constraint"));
        }
    }

    diagnostic
}
```

## Code Examples and Patterns

Our examples cover different types of errors developers encounter in HashQL:

### Type System Errors

**Basic type mismatch:**

```rust
pub fn undefined_variable_error(
    span: SpanId,
    var_name: &str,
    suggestions: Vec<String>,
) -> TypeCheckDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::UndefinedVariable,
        Severity::Error,
    ).primary(Label::new(
        span,
        format!("cannot find variable `{}` in this scope", var_name),
    ));

    // Add suggestions if available
    if !suggestions.is_empty() {
        // Create suggestion patches for "did you mean" style suggestions
        let patches: Vec<_> = suggestions.iter().take(3)
            .map(|suggestion| Patch::new(span, suggestion.clone()))
            .collect();

        let primary = patches.remove(0);

        if patches.is_empty() {
            let suggestion = Suggestions::patch(primary);

            diagnostic.add_message(
                Message::help(format!("a local variable with a similar name exists: {}", suggestions[0]))
                    .with_suggestions(suggestion)
            );
        } else {
            let suggestion = Suggestions::patch(primary).with_trailer(format!("and {} other candidates", suggestions.len() - 3));
            suggestion.extend(patches);

            diagnostic.add_message(
                Message::help("you might have meant any of these local variables")
                    .with_suggestions(suggestion)
            );
        }
    }

    diagnostic
}
```

**Type mismatch with suggestions:**

```rust
pub fn type_mismatch_error<T, U>(
    expected_span: SpanId,
    found_span: SpanId,
    expected_type: T,
    found_type: U,
) -> TypeCheckDiagnostic
where
    T: Display,
    U: Display,
{
    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::TypeMismatch,
        Severity::Error,
    ).primary(Label::new(
        found_span,
        format!("expected `{}`, found `{}`", expected_type, found_type),
    ));

    // Add context about where the expectation comes from
    diagnostic.labels.push(Label::new(
        expected_span,
        "expected because of this"
    ));

    diagnostic
}
```

### Parse and Syntax Errors

**Missing semicolon:**

```rust
pub fn missing_semicolon_error(
    stmt_span: SpanId,
    stmt_end: SpanId,
) -> TypeCheckDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeCheckDiagnosticCategory::MissingSemicolon,
        Severity::Error,
    ).primary(Label::new(
        stmt_span,
        "expected `;` after this expression"
    ));

    // Provide a concrete suggestion with code patch
    let suggestion = Suggestions::patch(Patch::new(stmt_end, ";"));
    diagnostic.add_message(
        Message::help("add `;` here").with_suggestions(suggestion)
    );

    diagnostic
}
```

## Testing with Compiletest

HashQL uses compiletest for testing diagnostics. Test files use special annotations:

### Test File Structure

```jsonc
//@ run: pass
//@ description: Tests undefined variable error
[
  "let",
  ["x", "undefined_var"]
  //~^ ERROR cannot find variable `undefined_var` in this scope
]
```

### Annotation Syntax

```
//~ [LINE_REF] SEVERITY[CATEGORY] message
```

**Line References:**

- `^` - Previous line(s): `//~^^ ERROR` (2 lines up)
- `v` - Next line(s): `//~vv WARNING` (2 lines down)
- `|` - Same line as previous diagnostic
- `?` - Unknown line position
- No prefix - Current line

### Expected Output (.stderr files)

Expected output should match the established diagnostic format:

```
error[type-check::type-mismatch]: Type Mismatch
  --> test.hashql:5:12
   |
5  |   if name {
   |      ^^^^ expected `bool`, found `String`
   |
help: try using a comparison instead
   |
5  |   if name == "something" {
   |      ~~~~~~~~~~~~~~~~~~
```

## Review Checklist

### Message Quality

- [ ] **Follows established style**: Lowercase start, no punctuation (unless multi-sentence)
- [ ] **Uses backticks**: All code elements are in backticks
- [ ] **Avoids "illegal"**: Uses "invalid" or more specific terms
- [ ] **Matter-of-fact tone**: No apologies or hedging
- [ ] **Plain English**: Understandable by any programmer
- [ ] **Succinct but clear**: Not verbose, but sufficient information

### Content Quality

- [ ] **Clear subject**: What exactly is wrong?
- [ ] **Precise location**: Spans point to the right code
- [ ] **Actionable guidance**: User knows what to do next
- [ ] **Appropriate severity**: Matches the actual impact
- [ ] **Self-contained labels**: Primary label makes sense alone

### Technical Accuracy

- [ ] **Correct spans**: Point to actual problematic code
- [ ] **Valid suggestions**: Proposed fixes actually work
- [ ] **Proper categorization**: Category matches the error type
- [ ] **Consistent terminology**: Uses HashQL terms correctly

### Testing

- [ ] **Compiletest coverage**: Diagnostic is tested
- [ ] **Expected output**: `.stderr` file matches actual output
- [ ] **Follows format**: Uses established diagnostic format conventions

## Advanced Patterns

### Context-Sensitive Messages

```rust
fn create_context_aware_error(context: &Context, span: SpanId) -> Diagnostic {
    let message = match context.kind {
        ContextKind::Function => "cannot find variable `{}` in this scope",
        ContextKind::Struct => "no field `{}` on type `{}`",
        ContextKind::Impl => "method `{}` not found for this type",
    };

    Diagnostic::new(category, Severity::Error)
        .primary(Label::new(span, format!(message, context.name)))
}
```

### Context-Sensitive Categories

For diagnostics that need to include contextual information (like variable names, types, or specific values) in the category name:

```rust
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum VariableResolutionCategory<'heap> {
    UndefinedVariable(Symbol<'heap>),
    AmbiguousVariable(Symbol<'heap>),
    ShadowedVariable(Symbol<'heap>),
}

impl<'heap> DiagnosticCategory for VariableResolutionCategory<'heap> {
    fn id(&self) -> Cow<'_, str> {
        match self {
            Self::UndefinedVariable(_) => Cow::Borrowed("undefined-variable"),
            Self::AmbiguousVariable(_) => Cow::Borrowed("ambiguous-variable"),
            Self::ShadowedVariable(_) => Cow::Borrowed("shadowed-variable"),
        }
    }

    fn name(&self) -> Cow<'_, str> {
        match self {
            Self::UndefinedVariable(var) => Cow::Owned(format!("Undefined Variable `{}`", var.unwrap())),
            Self::AmbiguousVariable(var) => Cow::Owned(format!("Ambiguous Variable `{}`", var.unwrap())),
            Self::ShadowedVariable(var) => Cow::Owned(format!("Shadowed Variable `{}`", var.unwrap())),
        }
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        // These are terminal categories, so no subcategory
        // But nothing is stopping us from adding a subcategory later
        None
    }
}

// Usage example:
pub fn undefined_variable_error<'heap>(
    var_name: Symbol<'heap>,
    span: SpanId,
) -> TypeCheckDiagnostic {
    Diagnostic::new(
        VariableResolutionCategory::UndefinedVariable(var_name),
        Severity::Error,
    ).primary(Label::new(
        span,
        format!("cannot find variable `{}` in this scope", var_name),
    ))
}
```

### Suggestion Guidelines (Established Style)

```rust
// ✅ Good suggestion messages
"add type annotations here"
"try using `.to_string()`"
"consider using a `match` expression"

// ❌ Bad suggestion messages
"did you mean this?" // Too vague, use specific suggestion
"try the following:" // Use the span to show what
"maybe you want:"    // Be more direct
```

## Common Anti-Patterns

### Don't Do This

```rust
// ❌ Wrong style (capitalized, punctuation)
Label::new(span, "Error occurred here.")

// ❌ Not following established conventions
Label::new(span, "This is of type `String`")

// ❌ Too verbose for label
Label::new(span, "this expression has a type that doesn't match")

// ❌ Apologetic tone
Message::help("Sorry, you need to fix the type mismatch")
```

### Do This Instead

```rust
// ✅ Established style (lowercase, no punctuation, concise)
Label::new(span, "expected `bool`, found `String`")

// ✅ Spatially aware and concise
Label::new(span, "cannot find variable `count`")

// ✅ Matter-of-fact and helpful
Message::help("add type annotations to resolve this")
```

## Troubleshooting Guide

### Common Diagnostic Issues and Solutions

**Issue: Diagnostic messages are too verbose**

```rust
// ❌ Problem
Label::new(span, "This expression has type `String` but the function expects type `i32` so there is a type mismatch")

// ✅ Solution  
Label::new(span, "expected `i32`, found `String`")
```

**Issue: Spans are confusing or too broad**

```rust
// ❌ Problem - spans across multiple lines
Label::new(entire_function_span, "type error in function")

// ✅ Solution - point to specific issue
Label::new(return_expr_span, "expected `bool`, found `i32`")
```

**Issue: Suggestions don't apply cleanly**

```rust
// ❌ Problem - suggestion assumes too much context
Patch::new(span, "Some(value.to_string())")

// ✅ Solution - minimal, focused change
Patch::new(span, ".to_string()")
```

**Issue: Error categories are too granular**

```rust
// ❌ Problem - overly specific categories
enum CategoryProblem {
    UndefinedVariableInFunction,
    UndefinedVariableInLoop, 
    UndefinedVariableInCondition,
}

// ✅ Solution - general category with context in message
enum CategorySolution {
    UndefinedVariable,
}
// Context goes in the message: "cannot find variable `x` in this scope"
```

**Issue: Diagnostic quality varies across compiler phases**

*Problem*: Parse errors are clear but type errors are cryptic.

*Solution*: Establish diagnostic review process:

1. Create diagnostic templates for each error category
2. Review diagnostics with actual users during development  
3. Maintain style consistency across all compiler phases

**Issue: Too many cascading errors**

*Problem*: One undefined variable causes 50+ subsequent errors.

*Solution*: Implement error recovery and suppression:

```rust
// Track what errors we've already reported
if context.already_reported_undefined(var_name) {
    return; // Don't report again
}

// Use error recovery tokens to continue parsing
if matches!(token, RecoveryToken::Semicolon | RecoveryToken::Brace) {
    // Continue parsing instead of bailing out
}
```

**Issue: Diagnostics aren't helpful for complex scenarios**

*Problem*: Simple template messages don't work for nuanced situations.

*Solution*: Context-aware diagnostic generation:

```rust
fn generate_context_aware_diagnostic(context: &CompilationContext) -> Diagnostic {
    match (context.phase, context.construct_type, context.error_history) {
        (Phase::TypeCheck, Construct::Function, errors) if errors.contains_type_errors() => {
            // Provide function-specific guidance
        }
        (Phase::Parse, Construct::Expression, _) => {
            // Focus on syntax recovery
        }
        _ => {
            // Fall back to generic diagnostic
        }
    }
}
```

### Diagnostic Performance Tips

**Avoid expensive operations in diagnostic construction:**

```rust  
// ❌ Expensive - formats strings even if diagnostic won't be shown
Label::new(span, format!("complex formatting of {}", expensive_computation()))

// ✅ Cheap - lazy evaluation
Label::new(span, || format!("complex formatting of {}", expensive_computation()))
```

**Cache commonly used diagnostic components:**

```rust
// Reuse common message patterns
static COMMON_MESSAGES: LazyLock<HashMap<&str, Message>> = LazyLock::new(|| {
    HashMap::from([
        ("missing_semicolon", Message::help("add `;` to end the statement")),
        ("type_annotation", Message::help("add type annotations for clarity")),
    ])
});
```

Following these guidelines ensures HashQL diagnostics are consistent with proven compiler diagnostic conventions, making them clear, helpful, and familiar to developers.
