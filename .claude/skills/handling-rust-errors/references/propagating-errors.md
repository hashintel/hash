# Propagating Errors

This guide covers how to propagate errors through your code using `error-stack`.

---

## Basic Error Propagation

### Using the `?` Operator

```rust
use error_stack::{Report, ResultExt as _};

fn process_data(id: &str) -> Result<Data, Report<MyError>> {
    // Direct propagation - error types match
    let raw = fetch_raw_data(id)?;

    // Convert and propagate
    let processed = transform_data(raw)
        .change_context(MyError::TransformFailed)?;

    Ok(processed)
}
```

**Note:** Import `ResultExt as _` to bring trait methods into scope without polluting namespace.

---

## Converting Error Types

### Using `.change_context()`

Convert one error type to another:

```rust
use error_stack::ResultExt as _;

fn load_user(id: &str) -> Result<User, Report<UserError>> {
    // Convert DatabaseError → UserError
    let data = db::fetch(id)
        .change_context(UserError::DatabaseFailed)?;

    // Convert ParseError → UserError
    let user = parse_user_data(data)
        .change_context(UserError::ParseFailed)?;

    Ok(user)
}
```

---

## Adding Context

### Using `.attach()`

Add debugging information without changing error type:

```rust
use error_stack::ResultExt as _;

fn process_batch(items: &[Item]) -> Result<(), Report<ProcessError>> {
    for (idx, item) in items.iter().enumerate() {
        process_item(item)
            .attach(format!("Failed at index {}", idx))
            .attach(format!("Item ID: {}", item.id))?;
    }

    Ok(())
}
```

### Combining Context and Conversion

```rust
use error_stack::ResultExt as _;

fn update_user(id: &str, data: UserData) -> Result<User, Report<UserError>> {
    let existing = fetch_user(id)
        .change_context(UserError::FetchFailed)
        .attach(format!("User ID: {}", id))?;

    let updated = apply_updates(existing, data)
        .change_context(UserError::UpdateFailed)
        .attach(format!("Updates: {:?}", data))?;

    save_user(&updated)
        .change_context(UserError::SaveFailed)
        .attach(format!("User: {:?}", updated.id))?;

    Ok(updated)
}
```

---

## Lazy Context Attachment

For expensive computations, use `_with` variants to defer evaluation:

### Using `.attach_with()`

```rust
use error_stack::ResultExt as _;

fn process_large_data(data: &LargeData) -> Result<(), Report<ProcessError>> {
    expensive_operation(data)
        .change_context(ProcessError::OperationFailed)
        // Only compute debug string if error occurs
        .attach_with(|| format!("Data summary: {:?}", data.compute_summary()))?;

    Ok(())
}
```

### Using `.change_context_with()`

When error creation itself is expensive:

```rust
use error_stack::ResultExt as _;

fn process_with_expensive_error(item: &Item) -> Result<(), Report<ComplexError>> {
    operation(item)
        // Error variant creation might involve computation
        .change_context_with(|| ComplexError::from_item_analysis(item))
        .attach_with(|| format!("Item state: {:?}", item.expensive_debug()))?;

    Ok(())
}
```

**Rule of thumb:** Use `_with` variants only when the closure does non-trivial work.

---

## Async Error Propagation

Error propagation works the same in async code:

```rust
use error_stack::ResultExt as _;

async fn fetch_and_process(id: String) -> Result<Data, Report<ProcessError>> {
    // Propagate async errors
    let raw = fetch_async(&id)
        .await
        .change_context(ProcessError::FetchFailed)
        .attach(format!("ID: {}", id))?;

    // Mix sync and async operations
    let validated = validate_data(&raw)
        .change_context(ProcessError::ValidationFailed)?;

    let processed = process_async(validated)
        .await
        .change_context(ProcessError::ProcessingFailed)?;

    Ok(processed)
}
```

**Important:** The `.change_context()` call can appear before `.await` because `ResultExt` is in scope:

```rust
use error_stack::{FutureExt as _, ResultExt as _};

// ✅ This works - `FutureExt` trait is in scope
let result = async_operation()
    .change_context(MyError::Failed)
    .await?;

// ✅ Also correct - context added after await using `ResultExt`
let result = async_operation()
    .await
    .change_context(MyError::Failed)?;
```

---

## Converting External Errors

### Standard Library Errors

```rust
use error_stack::{Report, ResultExt as _};

fn read_file(path: &Path) -> Result<String, Report<FileError>> {
    // Convert std::io::Error
    let contents = std::fs::read_to_string(path)
        .map_err(Report::new)
        .change_context(FileError::ReadFailed)
        .attach(format!("Path: {}", path.display()))?;

    Ok(contents)
}
```

### Third-Party Library Errors

```rust
use error_stack::{Report, ResultExt as _};

fn parse_json(json: &str) -> Result<Value, Report<ParseError>> {
    // Convert serde_json::Error
    let value: Value = serde_json::from_str(json)
        .map_err(Report::new)
        .change_context(ParseError::JsonParseFailed)
        .attach(format!("JSON length: {}", json.len()))?;

    Ok(value)
}
```

---

## Error Chains

Build error chains for complex operations:

```rust
use error_stack::ResultExt as _;

fn complex_operation(id: &str) -> Result<Output, Report<ServiceError>> {
    // Each step adds to the error chain
    let data = fetch_data(id)
        .change_context(ServiceError::FetchFailed)
        .attach(format!("Step 1: fetch data for {}", id))?;

    let validated = validate(data)
        .change_context(ServiceError::ValidationFailed)
        .attach("Step 2: validation")?;

    let transformed = transform(validated)
        .change_context(ServiceError::TransformFailed)
        .attach("Step 3: transformation")?;

    let result = save(transformed)
        .change_context(ServiceError::SaveFailed)
        .attach("Step 4: save result")?;

    Ok(result)
}
```

---

## Best Practices

### DO:

✅ Always add context when propagating errors
✅ Use `.change_context()` to convert error types at boundaries
✅ Include relevant IDs, indices, or state in attachments
✅ Use `_with` variants for non-trivial closures
✅ Import `ResultExt as _` to avoid namespace pollution
✅ Add context close to where the error occurs

### DON'T:

❌ Propagate errors without context
❌ Add too much context (avoid duplicates)
❌ Include sensitive data in attachments
❌ Use `unwrap()` or `expect()` in production code
❌ Silently ignore errors with `let _ = ...`
❌ Use `_with` variants for trivial operations

---

## Common Patterns

### Option to Result Conversion

```rust
use error_stack::Report;

fn get_user_by_id(id: &str, users: &HashMap<String, User>) -> Result<&User, Report<UserError>> {
    users
        .get(id)
        .ok_or_else(|| Report::new(UserError::NotFound))
        .attach(format!("User ID: {}", id))
}
```

### Multiple Error Sources

```rust
use error_stack::ResultExt as _;

fn process_config(path: &Path) -> Result<Config, Report<ConfigError>> {
    let raw = std::fs::read_to_string(path)
        .map_err(Report::new)
        .change_context(ConfigError::ReadFailed)?;

    let parsed: RawConfig = toml::from_str(&raw)
        .map_err(Report::new)
        .change_context(ConfigError::ParseFailed)?;

    validate_config(&parsed)
        .change_context(ConfigError::ValidationFailed)?;

    Ok(build_config(parsed))
}
```

---

## Related References

- [Defining Errors](./defining-errors.md) - Create error types
- [Documenting Errors](./documenting-errors.md) - Document error conditions
