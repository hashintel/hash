# Block Protocol Type System

This crate implements the Block Protocol type system in Rust. It provides the foundation for defining, validating, and working with typed data in the HASH ecosystem.

## Overview

The Block Protocol Type System defines a structured approach to typing data. It enables:

- Clear definition of data schemas
- Validation of data against schemas
- Composition of schemas through references

## Core Concepts

### Types

The type system is built around three primary concepts:

1. **Data Types** - Primitive types like strings, numbers, booleans, arrays, and objects
1. **Property Types** - Reusable definitions of properties with their own schema
1. **Entity Types** - Definitions of entities with their property and relationship requirements

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
cargo doc --open
```
