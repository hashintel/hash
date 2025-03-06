# HASH Development Guide

## Coding Standards Reference

**ALWAYS** run this command at the beginning of each work session to read the authoritative project standards:

```bash
# Read all coding standards (ALWAYS run this at the start of each session)
cat .cursor/rules/*
```

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
1. Exploring available functions, types, and traits
1. Finding usage examples in doctest code blocks
1. Understanding error conditions and handling
1. Generating test data based on documented structures

## Build/Test/Lint Commands

### Rust

- Test: `cargo nextest run --package <package>` (for doc tests: `cargo test --package <package> --doc`)
- Test single: `cargo nextest run --package <package> -- test_name`
- Lint: `cargo clippy --all-features --all-targets --workspace --no-deps`
- Format: `cargo fmt`
- Documentation: `cargo doc --no-deps --all-features`
