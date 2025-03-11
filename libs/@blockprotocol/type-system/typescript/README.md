# Block Protocol Type System

This package provides TypeScript typings and implementations for the Block Protocol Type-System. It defines the foundational types and validation mechanisms for working with typed data in the HASH ecosystem. See the [RFC](https://github.com/blockprotocol/blockprotocol/blob/main/rfcs/text/0352-graph-type-system.md) for more details.

## Overview

The Block Protocol Type System defines a structured approach to typing data. It enables:

- Clear definition of data schemas
- Validation of data against schemas
- Composition of schemas through references
- Tracking of type metadata and provenance

## Core Concepts

The type system is built around several key components:

1. **Core Types**
   - **Data Types** - Primitive types like strings, numbers, booleans, arrays, and objects
   - **Property Types** - Reusable definitions of properties with their own schema
   - **Entity Types** - Definitions of entities with their property and relationship requirements

2. **Metadata and Provenance**
   - Type record management with temporal versioning
   - Ownership tracking (local vs. remote types)
   - Provenance information (creation, modification, origin)

## Development

### Building

Ensure you've installed the dependencies required for the `type-system` Rust crate, outlined in the respective [README](../rust/README.md).

Run:

- `yarn`
- `yarn build`

### Testing

If you've successfully built, you can run the tests with:

- `yarn test`
