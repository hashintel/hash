# Block Protocol Type System

This crate implements the Block Protocol type system in Rust. It provides the foundation for defining, validating, and working with typed data in the HASH ecosystem. For details on the type system design, see the [Block Protocol Type System RFC](https://github.com/blockprotocol/blockprotocol/blob/main/rfcs/text/0352-graph-type-system.md).

The corresponding TypeScript implementation can be found in the [`@blockprotocol/type-system`](../typescript) package. This crate is used to generate the TypeScript typings from the Rust implementation.

## Overview

The Block Protocol Type System defines a structured approach to typing data. It enables:

- Clear definition of data schemas
- Validation of data against schemas
- Composition of schemas through references

## Core Concepts

### Ontology Types and Knowledge Components

The type system is organized into two main parts:

#### Ontology (Type Definitions)

The ontology defines schemas and validation rules:

1. **Data Types** - Define validation rules for primitive values like strings, numbers, booleans
2. **Property Types** - Define reusable property schemas that can reference data types
3. **Entity Types** - Define complete entity structures with property and relationship requirements

#### Knowledge (Data Instances)

Knowledge components are concrete data instances that conform to ontology types:

1. **Values** - Primitive data values that conform to data types
2. **Properties** - Structured data (including arrays and objects) that conform to property types
3. **Entities** - Complete entity records with properties that conform to entity types

The relationship between ontology and knowledge is similar to schemas and records in databases:
ontology types define the structure and rules, while knowledge components contain the actual data
conforming to those rules.

### Metadata and Provenance

The type system includes comprehensive metadata for each type:

1. **Ontology Metadata** - Contains information about type records including:
   - Record IDs - Unique identifiers for each type
   - Temporal Versioning - When types were created or modified
   - Ownership - Whether types are owned locally or fetched from remote sources

2. **Provenance** - Tracks the origin and history of types:
   - Creation information - Who created the type and when
   - Edition information - History of changes to the type
   - Source information - Where the type originated from

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
