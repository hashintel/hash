---
name: rust-tracing-practices
description: "HASH tracing and instrumentation practices for Rust. Use when adding spans, events, or #[tracing::instrument] to Rust code."
license: AGPL-3.0
metadata:
  triggers:
    type: domain
    enforcement: suggest
    priority: medium
    keywords:
      - tracing
      - instrument
      - span
      - rust log
    intent-patterns:
      - "\\b(tracing|instrument|span)\\b"
      - "\\b(info|debug|trace|warn|error)!"
---

# Rust Tracing Practices

## Event Recording

- Use level-specific macros for appropriate visibility: `info!`, `debug!`, `trace!`, `warn!`, `error!`
- Provide structured data as named arguments to facilitate automated processing and filtering
- Prefer lowercase log-message prose while preserving identifier and acronym spelling
- Record ordinary error values with `Display`, using `%error` or `error = %error`
- Record an `error_stack::Report<Context>` with `Debug`, using `?report` or `error = ?report` on the complete report rather than its `current_context()` alone
- Keep public-response sanitization separate from diagnostic reporting. Debug formatting does not itself redact sensitive data
- Include relevant context through key-value pairs

These fragments assume a local `user`. Their error events are alternatives: `e` is an ordinary error value, and `report` is an `error_stack::Report<_>`.

```rust
tracing::info!(user_id = user.id, action = "login", "user logged in successfully");
tracing::error!(error = %e, user_id = user.id, "failed to authenticate user");
tracing::error!(error = ?report, user_id = user.id, "failed to authenticate user");
```

A report's plain `Display` stops after the first context and omits attachments. Its `Debug` formatter traverses the frames and renders printable attachments or installed hook output.

## Instrumentation

- Apply the `#[tracing::instrument]` attribute to functions to automatically create trace spans
- When an error return merits an automatic event, use `err` for an ordinary error and `err(Debug)` for an `error_stack::Report<Context>`
- Exclude sensitive or large parameters using `skip(password)` or `skip_all`
- Add custom context fields with `fields(request_id = req.id())`

```rust
#[tracing::instrument(level = "debug", err, skip(password), fields(user_id = user.id))]
async fn authenticate_user(user: &User, password: &[u8]) -> Result<AuthToken, AuthError> {
    // Implementation
}
```
