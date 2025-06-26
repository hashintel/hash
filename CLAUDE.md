# HASH Development Guide

## Repository Structure and Navigation

The HASH repository is organized into several key directories:

- `/apps` - Core applications powering HASH
  - `/hash-api` - Backend API service
  - `/hash-frontend` - Web frontend application
  - `/hash-graph` - Graph database service
  - `/hash-external-services` - External service integrations
  - `/hash-ai-worker-ts` - AI worker services
  - `/hash-integration-worker` - Integration worker services

- `/blocks` - Block Protocol components (each subfolder contains a self-contained block)

- `/libs` - Shared libraries and packages
  - `/@blockprotocol` - Block Protocol related libraries
  - `/@hashintel` - HASH-specific libraries
  - `/@local` - Internal libraries for the monorepo
  - Other core libraries (e.g., `error-stack`, `deer`)

- `/infra` - Deployment and infrastructure code
  - `/docker` - Docker configurations
  - `/terraform` - Terraform infrastructure as code

- `/tests` - Test suites spanning multiple components

**Navigation Tips:**

- When exploring a new feature, first identify which app or lib it belongs to
- Related code is typically co-located within the same directory
- Check existing implementations before creating new ones
- For understanding cross-component interactions, look for integration tests in `/tests`

## Coding Standards Reference

**IMPORTANT: I must ALWAYS read the full coding standards at the beginning of EACH session using this command:**

```bash
cat .cursor/rules/*
```

The rules in `.cursor/rules/*` contain detailed guidelines for:

- Git commit conventions
- Rust coding style (type system, async patterns, function arguments, etc.)
- Documentation practices (structure, links, error documentation, etc.)
- Error handling with error-stack
- Testing strategy and assertions
- Tracing and instrumentation

These full guidelines contain critical nuances and details that cannot be summarized. Reading the complete rules is essential for ensuring code quality and consistency.

## Documentation Best Practices

When documenting Rust code, follow these guidelines:

1. **Function Documentation Structure**:
   - Begin with a clear, single-line summary of what the function does
   - Include a detailed description of the function's behavior
   - For simple functions (0-2 parameters), describe parameters inline in the main description
   - For complex functions (3+ parameters), use an explicit "# Arguments" section with bullet points
   - Always describe return values in the main description text, not in a separate section
   - Document error conditions with an explicit "# Errors" section

2. **Type Documentation**:
   - Begin with a clear, single-line summary of what the type represents
   - Explain the type's purpose, invariants, and usage patterns
   - Document struct fields with field-level doc comments
   - Document enum variants clearly

3. **Examples**:
   - Include practical examples for public APIs
   - Ensure examples compile and demonstrate typical usage patterns
   - For complex types/functions, show multiple usage scenarios

This balanced approach maintains readability while providing necessary structure for complex APIs.

## Tracing and Instrumentation

### Function-level Instrumentation (Preferred)

For most cases, use `#[tracing::instrument]` directly on functions:

```rust
// ✅ Best - automatic span creation with function name and arguments
#[tracing::instrument(level = "info", skip(self))]
async fn compile_query(&self, params: &QueryParams) -> Result<Query, Error> {
    // Function body automatically wrapped in span
}

// ✅ Good - customize span name and fields
#[tracing::instrument(level = "info", name = "db_query", skip(self), fields(table = %table_name))]
async fn execute_query(&self, table_name: &str) -> Result<Rows, Error> {
    // Function body
}
```

### Manual Instrumentation for Async Calls

#### Creating New Spans

When adding tracing spans to async code, use `.instrument()` before `.await`:

```rust
// ✅ Good - clean and readable
let result = some_async_function()
    .instrument(tracing::info_span!("operation_name"))
    .await?;

// ❌ Avoid - unnecessarily verbose
let result = async {
    some_async_function().await
}
.instrument(tracing::info_span!("operation_name"))
.await?;
```

#### Inheriting Current Span Context

For certain scenarios where span context needs to be explicitly inherited, use `.in_current_span()`:

```rust
// ✅ Required for spawned tasks - inherits current span context
tokio::spawn(async {
    background_work().await
}.in_current_span());

// ❌ Bad - loses tracing context
tokio::spawn(async {
    background_work().await
});

// ✅ Required for non-async functions returning Future with combinators
#[tracing::instrument]
fn some_function() -> impl Future<Output = Result<T, E>> {
    async_operation()
        .and_then(|x| other_operation(x))
        .in_current_span()  // Required because no .await possible here
}

// ✅ Not needed - async functions inherit span context automatically
#[tracing::instrument]
async fn some_function() -> Result<T, E> {
    let result = async_operation().await?;  // Span context preserved automatically
    other_operation(result).await
}
```

### When to Use `.in_current_span()`

**Simple Rule: Use `.in_current_span()` when you CANNOT use `.await`**

- **Can you write `.await`?** → No `.in_current_span()` needed (span context transfers automatically)
- **Cannot write `.await`?** → `.in_current_span()` likely needed

**Specific cases requiring `.in_current_span()`:**

1. **Spawned tasks**: `tokio::spawn(async { ... }.in_current_span())`
2. **Non-async functions returning Future**: Functions with `#[instrument]` that return `impl Future` using combinator chains (`.and_then`, `.map`, etc.)
3. **Cross-thread async work**: When moving async work across thread boundaries

**Cases NOT requiring `.in_current_span()`:**

- **Async functions**: Span context is automatically inherited across `.await` points
- **Async blocks in non-async functions**: `async { ... }` blocks automatically inherit span context
- **Normal function calls**: Synchronous code within the same thread

### When to Use Each Approach

- **Function-level (`#[instrument]`)**: Use for entire functions, especially when you want to trace function entry/exit and arguments
- **Manual (`.instrument()`)**: Use for specific async operations within a function or when you need fine-grained control over span creation
- **Context inheritance (`.in_current_span()`)**: Use when span context would otherwise be lost (spawned tasks, combinator chains without `.await`)

## Creating code context in Rust

To get an idea about an API in rust, the easiest way is to generate it's documentation:

```bash
# Generate documentation without opening it
cargo doc --no-deps --all-features --package <package-name>

# Generate documentation for the entire workspace
cargo doc --no-deps --all-features --workspace
```

These commands will generate HTML documentation from the code and docstrings, providing a comprehensive view of the crate's structure, public API, and usage examples. This approach is particularly effective for:

1. Understanding a crate's organization and component relationships
2. Exploring available functions, types, and traits
3. Finding usage examples in doctest code blocks
4. Understanding error conditions and handling
5. Generating test data based on documented structures

## Common Commands

### Development

- Main development: `yarn dev` (starts API and frontend)
- Backend only: `yarn dev:backend` or `yarn dev:backend:api`
- Frontend only: `yarn dev:frontend`
- Realtime server: `yarn dev:backend:realtime`
- Search loader: `yarn dev:backend:search-loader`

### Starting Services

- Start all services: `yarn start`
- Start graph only: `yarn start:graph`
- Start backend only: `yarn start:backend`
- Start frontend only: `yarn start:frontend`
- Start workers: `yarn start:worker`

### Testing

- Unit tests: `yarn test:unit`
- Integration tests: `yarn test:integration`

### Linting and Fixing

- Lint everything: `yarn lint`
- TypeScript type check: `yarn lint:tsc`
- ESLint: `yarn lint:eslint`
- Formatting check: `yarn lint:format`

- Fix ESLint issues: `yarn fix:eslint`
- Fix formatting: `yarn fix:format`

### For Specific Packages

When working on a specific package, use:

```bash
# For TypeScript/JavaScript packages
turbo run <command> --filter '<package-name>'

# For Rust packages
cargo nextest run --package <package-name>
cargo test --package <package-name> --doc  # For doc tests
cargo clippy --all-features --package <package-name>
```

For Rust packages, you can add features as needed with `--all-features`, specific features like `--features=foo,bar`, or use `cargo-hack` with `--feature-powerset` for comprehensive feature testing.

# PR Review Guide

When reviewing a Pull Request, follow these steps to provide comprehensive feedback:

## 1. Initial Information Gathering

Always collect the following information first:

- PR content (description, title, etc.)
- Diff changes (show ALL the changes – don't pipe them into head. Don't use --name-only)
- Existing comments and conversation

Use the following commands:

**1a. View PR metadata, description, general comments and changed files**

```bash
gh pr view <PR_NUMBER> --comments
gh pr diff <PR_NUMBER>
```

**1b. View comments on the diff**

```bash
gh api \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  /repos/OWNER/REPO/pulls/PULL_NUMBER/comments
```

## 2. Check Referenced Linear Issues

- Look for Linear issue references in the PR title or description (format: H-XXXX)
- Fetch each referenced Linear issue to understand the original requirements
- Use these requirements as the baseline for your review

```bash
# Example of fetching a Linear issue
mcp__linear__get_issue --issueId "H-XXXX"
```

## 3. Provide Code Quality Feedback

- Be precise about the location and nature of issues
- Include suggestions for improvement when possible
- Reference relevant code standards from the repository
