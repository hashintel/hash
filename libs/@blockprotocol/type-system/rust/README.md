# Block Protocol Type System

This crate implements the Block Protocol type system in Rust. It provides the foundation for defining, validating, and working with typed data in the HASH ecosystem. For details on the type system design, see the [Block Protocol Type System RFC](https://github.com/blockprotocol/blockprotocol/blob/main/rfcs/text/0352-graph-type-system.md).

The corresponding TypeScript implementation can be found in the [`@blockprotocol/type-system`](../typescript) package. This crate is used to generate the TypeScript typings from the Rust implementation.

## Overview

The Block Protocol Type System defines a structured approach to typing data. It enables:

- Clear definition of data schemas
- Validation of data against schemas
- Composition of schemas through references

## Core Concepts

### Types

The type system is built around three primary concepts:

1. **Data Types** - Primitive types like strings, numbers, booleans, arrays, and objects
2. **Property Types** - Reusable definitions of properties with their own schema
3. **Entity Types** - Definitions of entities with their property and relationship requirements

### Validation

The type system's central purpose is ensuring data integrity through validation:

- Type checking and constraint validation
- Property validation against schemas
- Entity validation against entity type definitions

### Type References

Types can reference other types, creating a graph of type dependencies:

- Entity types reference property types
- Property types can reference data types
- Type references are resolved at validation time

## Features

- JSON Schema-like validation capabilities
- PostgreSQL integration for database storage
- WebAssembly support for frontend validation
- Extensible validator architecture

## Usage

For detailed usage examples and API documentation, run:

```sh
cargo doc --all-features --open
```
