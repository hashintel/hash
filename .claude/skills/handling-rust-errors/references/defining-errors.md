# Defining Errors

This guide covers how to define custom error types in HASH using `error-stack` and `derive_more`.

---

## Basic Error Type

Use `derive_more` for the `Display` trait:

```rust
use core::error::Error;

#[derive(Debug, derive_more::Display)]
#[display("Operation failed: {_variant}")]
pub enum MyError {
    #[display("Resource `{id}` not found")]
    NotFound { id: String },

    #[display("Operation timed out after {seconds}s")]
    Timeout { seconds: u64 },

    #[display("Invalid input: {reason}")]
    InvalidInput { reason: String },
}

impl Error for MyError {}
```

**Key Points:**

- Use `#[derive(Debug, derive_more::Display)]`
- Top-level `#[display("...")]` provides fallback message
- Per-variant `#[display("...")]` for specific messages
- Use `{_variant}` in top-level to show variant name
- Manually implement `Error` trait (just `impl Error for MyError {}`)
- Import from `core::error::Error`, NOT `std::error::Error`

---

## Error Enum Patterns

### Simple Variants

```rust
#[derive(Debug, derive_more::Display)]
pub enum DatabaseError {
    #[display("Connection failed")]
    ConnectionFailed,

    #[display("Query timeout")]
    Timeout,

    #[display("Record not found")]
    NotFound,
}

impl Error for DatabaseError {}
```

### Variants with Data

```rust
#[derive(Debug, derive_more::Display)]
pub enum ValidationError {
    #[display("Field `{field}` is required")]
    MissingField { field: String },

    #[display("Invalid format for `{field}`: expected {expected}")]
    InvalidFormat {
        field: String,
        expected: String,
    },

    #[display("Value `{value}` out of range [{min}, {max}]")]
    OutOfRange {
        value: i64,
        min: i64,
        max: i64,
    },
}

impl Error for ValidationError {}
```

### Variants with Wrapped Errors

```rust
#[derive(Debug, derive_more::Display)]
pub enum ConfigError {
    #[display("Failed to read config file")]
    ReadFailed,

    #[display("Failed to parse config")]
    ParseFailed,

    #[display("Missing required field: {field}")]
    MissingField { field: String },
}

impl Error for ConfigError {}

// Use error-stack to wrap the underlying errors
fn load_config(path: &Path) -> Result<Config, Report<ConfigError>> {
    let contents = std::fs::read_to_string(path)
        .map_err(|e| Report::new(e))
        .change_context(ConfigError::ReadFailed)?;

    let config: Config = serde_json::from_str(&contents)
        .map_err(|e| Report::new(e))
        .change_context(ConfigError::ParseFailed)?;

    Ok(config)
}
```

---

## Error Type Hierarchies

For complex systems, create error hierarchies:

```rust
// High-level service error
#[derive(Debug, derive_more::Display)]
pub enum ServiceError {
    #[display("Database operation failed")]
    Database,

    #[display("Validation failed")]
    Validation,

    #[display("Authorization denied")]
    Authorization,

    #[display("External service error")]
    External,
}

impl Error for ServiceError {}

// Specific database errors
#[derive(Debug, derive_more::Display)]
pub enum DatabaseError {
    #[display("Connection failed")]
    ConnectionFailed,

    #[display("Query failed")]
    QueryFailed,

    #[display("Transaction aborted")]
    TransactionAborted,
}

impl Error for DatabaseError {}

// Convert specific to general
fn process() -> Result<(), Report<ServiceError>> {
    fetch_from_db()
        .change_context(ServiceError::Database)?;

    validate_input()
        .change_context(ServiceError::Validation)?;

    Ok(())
}
```

---

## Common Patterns

### Error with Source Information

```rust
#[derive(Debug, derive_more::Display)]
pub enum FileError {
    #[display("Failed to open file at `{path}`")]
    OpenFailed { path: String },

    #[display("Failed to read file at line {line}")]
    ReadFailed { line: usize },

    #[display("Invalid file format in `{path}`: {reason}")]
    InvalidFormat { path: String, reason: String },
}

impl Error for FileError {}
```

### Error with Debug Context

```rust
#[derive(Debug, derive_more::Display)]
pub enum QueryError {
    #[display("Query compilation failed")]
    CompilationFailed,

    #[display("Query execution failed")]
    ExecutionFailed,

    #[display("Invalid query parameter: {param}")]
    InvalidParameter { param: String },
}

impl Error for QueryError {}

// Usage with context
fn execute_query(sql: &str) -> Result<Rows, Report<QueryError>> {
    let compiled = compile(sql)
        .change_context(QueryError::CompilationFailed)
        .attach_printable(format!("SQL: {}", sql))?;

    run(compiled)
        .change_context(QueryError::ExecutionFailed)
        .attach_printable(format!("Compiled query: {:?}", compiled))?;

    // ...
}
```

---

## Best Practices

### DO:

✅ Use descriptive variant names
✅ Include relevant context in variant fields
✅ Use `core::error::Error` instead of `std::error::Error`
✅ Keep error messages user-friendly but informative
✅ Use structured data (fields) instead of formatted strings

### DON'T:

❌ Use `thiserror` (use `derive_more` instead)
❌ Use `Box<dyn Error>` in error variants
❌ Include sensitive data in error messages
❌ Make error messages too technical for end users
❌ Create overly generic error types

---

## Testing Error Types

```rust
#[test]
fn error_display_format() {
    let error = MyError::NotFound {
        id: "user_123".to_string(),
    };

    assert_eq!(
        error.to_string(),
        "Resource `user_123` not found",
        "Error message should match expected format"
    );
}

#[test]
fn error_with_report() {
    let report = Report::new(MyError::Timeout { seconds: 30 })
        .attach_printable("During database query");

    assert!(matches!(
        report.current_context(),
        MyError::Timeout { seconds: 30 }
    ));
}
```

---

## Related References

- [Propagating Errors](./propagating-errors.md) - Handle and propagate these errors
- [Documenting Errors](./documenting-errors.md) - Document these in functions
