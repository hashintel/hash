//! Numeric data types and serialization utilities.
//!
//! This module provides custom numeric types and related serialization/deserialization
//! functionality for handling precise mathematical operations in the HASH platform.
//!
//! The module includes:
//! - [`Real`]: A high-precision floating point number implementation
//! - Conversion utilities for working with standard Rust numeric types
//! - Serialization support for various formats

pub use self::real::{ConversionError, Real};

mod real;
