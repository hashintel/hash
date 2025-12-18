# Documenting Errors

This guide covers how to document error conditions in HASH Rust code.

---

## Error Documentation Format

All fallible functions must document their errors with an `# Errors` section.

### Basic Format

```rust
/// Creates a new web in the system.
///
/// Registers a new web with the given parameters and ensures uniqueness.
///
/// # Errors
///
/// - [`WebAlreadyExists`] if a web with the same ID already exists
/// - [`AuthorizationError`] if the account lacks permission
/// - [`DatabaseError`] if the operation fails at the database level
///
/// [`WebAlreadyExists`]: WebError::WebAlreadyExists
/// [`AuthorizationError`]: WebError::Authorization
/// [`DatabaseError`]: WebError::Database
pub fn create_web(&mut self) -> Result<WebId, Report<WebError>> {
    // Implementation
}
```

**Key Elements:**

- `# Errors` section header
- Bullet point for each error variant
- Intra-doc links using `` [`VariantName`] `` syntax
- Link definitions at the bottom

---

## Linking Error Variants

### Same Module Errors

```rust
#[derive(Debug, derive_more::Display)]
pub enum UserError {
    #[display("User not found")]
    NotFound,

    #[display("Unauthorized access")]
    Unauthorized,
}

impl Error for UserError {}

/// Fetches a user by ID.
///
/// # Errors
///
/// - [`NotFound`] if the user doesn't exist
/// - [`Unauthorized`] if the caller lacks permission
///
/// [`NotFound`]: UserError::NotFound
/// [`Unauthorized`]: UserError::Unauthorized
pub fn fetch_user(id: &str) -> Result<User, Report<UserError>> {
    // Implementation
}
```

### Cross-Module Errors

```rust
/// Validates user input.
///
/// # Errors
///
/// - [`ValidationError::EmptyInput`] if the input is empty
/// - [`ValidationError::TooLong`] if the input exceeds max length
///
/// [`ValidationError::EmptyInput`]: crate::validation::ValidationError::EmptyInput
/// [`ValidationError::TooLong`]: crate::validation::ValidationError::TooLong
pub fn validate_input(input: &str) -> Result<(), Report<ValidationError>> {
    // Implementation
}
```

---

## Runtime/Dynamic Errors

For errors created dynamically (not enum variants):

```rust
/// Validates that all input values are unique.
///
/// # Errors
///
/// Returns a validation error if the input contains duplicate values
pub fn validate_unique(values: &[String]) -> Result<(), Report<ValidationError>> {
    for (i, value) in values.iter().enumerate() {
        if values[i + 1..].contains(value) {
            return Err(Report::new(ValidationError::DuplicateValue))
                .attach(format!("Duplicate: {}", value));
        }
    }
    Ok(())
}
```

**Note:** No intra-doc links needed for dynamically created errors - just describe the condition.

---

## Multiple Error Sources

When a function can fail for many reasons:

```rust
/// Processes a configuration file.
///
/// Reads the file from disk, parses it, and validates the contents.
///
/// # Errors
///
/// - [`ReadFailed`] if the file cannot be read
/// - [`ParseFailed`] if the file contains invalid syntax
/// - [`ValidationFailed`] if the configuration is semantically invalid
/// - Returns an error if any required field is missing
///
/// [`ReadFailed`]: ConfigError::ReadFailed
/// [`ParseFailed`]: ConfigError::ParseFailed
/// [`ValidationFailed`]: ConfigError::ValidationFailed
pub fn process_config(path: &Path) -> Result<Config, Report<ConfigError>> {
    // Implementation
}
```

---

## Async Function Errors

Document the same way as sync functions:

```rust
/// Fetches user data from the database.
///
/// # Errors
///
/// - [`ConnectionFailed`] if the database connection is unavailable
/// - [`QueryFailed`] if the SQL query fails
/// - [`NotFound`] if no user with the given ID exists
///
/// [`ConnectionFailed`]: DatabaseError::ConnectionFailed
/// [`QueryFailed`]: DatabaseError::QueryFailed
/// [`NotFound`]: DatabaseError::NotFound
pub async fn fetch_user_async(id: i64) -> Result<User, Report<DatabaseError>> {
    // Implementation
}
```

---

## Testing Error Conditions

Write tests for each documented error case:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn user_not_found_returns_error() {
        let result = fetch_user("nonexistent_id");

        let err = result.expect_err("should return error for nonexistent user");

        // Check the error type
        assert!(
            matches!(
                err.current_context(),
                UserError::NotFound
            ),
            "should return NotFound error"
        );
    }

    #[test]
    fn unauthorized_access_returns_error() {
        let result = fetch_user_without_permission("user_123");

        let err = result.expect_err("should return error for unauthorized access");

        assert!(
            matches!(
                err.current_context(),
                UserError::Unauthorized
            ),
            "should return Unauthorized error"
        );
    }

    #[test]
    fn successful_fetch() {
        let result = fetch_user("valid_user_id");

        result.expect("should successfully fetch existing user");
    }
}
```

**Key Points:**

- Test **every** error variant mentioned in docs
- Use `.expect_err("should...")` format
- Assert on specific error types with `matches!`
- Include success case tests too

---

## Examples in Documentation

When writing `# Examples` sections for fallible functions:

### Prefer `?` Operator

Use `?` for error propagation in examples whenever possible:

```rust
/// Fetches and processes user data.
///
/// # Examples
///
/// ```
/// # use myapp::{fetch_user, UserError};
/// # use error_stack::Report;
/// let user = fetch_user("user_123")?;
/// println!("User: {}", user.name);
/// # Ok::<_, Box<dyn core::error::Error>>(())
/// ```
pub fn fetch_user(id: &str) -> Result<User, Report<UserError>> {
    // Implementation
}
```

**Key Points:**

- Use `?` instead of `.unwrap()` or `match`
- Add `# Ok::<_, Box<dyn core::error::Error>>(())` at the end
- This makes examples more realistic and idiomatic

### When NOT to Use `?`

Only use explicit error handling when demonstrating error handling itself:

```rust
/// Validates user input.
///
/// # Examples
///
/// ```
/// # use myapp::{validate_input, ValidationError};
/// match validate_input("test") {
///     Ok(()) => println!("Valid"),
///     Err(e) => eprintln!("Invalid: {}", e),
/// }
/// ```
pub fn validate_input(input: &str) -> Result<(), Report<ValidationError>> {
    // Implementation
}
```

---

## Best Practices

### DO:

✅ Document ALL error cases in fallible functions
✅ Use intra-doc links for error variants
✅ Be specific about error conditions
✅ Test each documented error case
✅ Update docs when adding new error variants
✅ Link to error enum documentation when relevant

### DON'T:

❌ Skip error documentation ("obvious" cases still need docs)
❌ Use plain text without intra-doc links
❌ Document only some error variants
❌ Write vague error descriptions ("may fail")
❌ Forget to update tests when docs change

---

## Examples

### Complete Function Documentation

```rust
#[derive(Debug, derive_more::Display)]
pub enum RegistrationError {
    #[display("Email already registered")]
    EmailTaken,

    #[display("Invalid email format")]
    InvalidEmail,

    #[display("Password too weak")]
    WeakPassword,
}

impl Error for RegistrationError {}

/// Registers a new user in the system.
///
/// Creates a new user account with the provided email and password.
/// The email must be unique and the password must meet security requirements.
///
/// # Errors
///
/// - [`EmailTaken`] if another user is already registered with this email
/// - [`InvalidEmail`] if the email format is invalid
/// - [`WeakPassword`] if the password doesn't meet security requirements
///
/// [`EmailTaken`]: RegistrationError::EmailTaken
/// [`InvalidEmail`]: RegistrationError::InvalidEmail
/// [`WeakPassword`]: RegistrationError::WeakPassword
///
/// # Examples
///
/// ```
/// # use myapp::{register_user, RegistrationError};
/// # use error_stack::Report;
/// let user_id = register_user("user@example.com", "SecurePass123!")?;
/// # Ok::<_, Box<dyn core::error::Error>>(())
/// ```
pub fn register_user(email: &str, password: &str) -> Result<UserId, Report<RegistrationError>> {
    // Implementation
}
```

---

## Related References

- [Defining Errors](./defining-errors.md) - Create error types
- [Propagating Errors](./propagating-errors.md) - Add context and convert errors
