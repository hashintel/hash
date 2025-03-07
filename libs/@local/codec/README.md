# HASH Codec Library

A serialization, deserialization, and encoding utility library for the HASH platform.

## Purpose

The codec library serves as a central repository for all serialization, deserialization, and encoding functionality used across the HASH platform. It provides consistent, reliable implementations for handling various data formats and protocols.

Key characteristics:

- **Modular Design**: Feature-gated modules for specific encoding needs
- **Protocol Support**: Implementations for standard protocols like HaRPC
- **Streaming Capabilities**: Efficient handling of streaming data with minimal allocations
- **Error Handling**: Consistent error handling using `error-stack` for detailed error reports

## Architecture

The library is organized into several feature-gated modules:

```text
codec
├── bytes    - JSON lines encoding/decoding for streaming data
├── harpc    - HaRPC protocol codecs and messaging types
├── numeric  - Utilities for handling numeric data types
└── serde    - Serialization/deserialization utilities and formatters
```

### Module Structure

- **bytes**: Provides streaming encoders and decoders for processing JSON data as newline-delimited records.
  - `JsonLinesEncoder`: Serializes values to JSON and appends newlines
  - `JsonLinesDecoder`: Reads newline-delimited JSON and deserializes into typed values

- **harpc**: Implements the HaRPC protocol for efficient RPC communication.
  - Provides binary serialization of messages
  - Supports streaming data exchange

- **numeric**: Utilities for safe and consistent numeric value handling.
  - Type conversions
  - Serialization formats

- **serde**: Custom serializers, deserializers, and utilities.
  - Type-specific formatters
  - Shared serialization patterns

## Design Principles

1. **Type Safety**: Strong typing with comprehensive validation
1. **Efficiency**: Minimal allocations and optimized processing for streaming data
1. **Error Clarity**: Detailed error reporting with context
1. **Modularity**: Components can be used independently through feature flags
1. **Testing**: Extensive test coverage with property-based testing where appropriate

## Feature Flags

The library is feature-gated to allow including only needed functionality:

- `bytes`: Enable JSON lines encoding/decoding
- `harpc`: Enable HaRPC protocol support
- `numeric`: Enable numeric utilities
- `serde`: Enable serialization/deserialization utilities

## Integration Points

The codec library integrates with:

- Tokio ecosystem for async streaming
- Serde for serialization/deserialization
- Error-stack for error handling
