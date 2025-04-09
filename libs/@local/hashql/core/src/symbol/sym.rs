//! Symbol definitions for the HashQL language.
//!
//! This module contains predefined symbol constants used throughout HashQL processing.
//! It includes symbols for module names, kernel special forms, and kernel types.
//!
//! # Usage
//!
//! Symbols from this module should always be accessed with the `sym` prefix:
//!
//! ```
//! use crate::symbol::sym;
//!
//! let type_symbol = sym::r#type;
//! let fn_symbol = sym::r#fn;
//! ```
//!
//! This naming convention helps distinguish symbol references from regular identifiers
//! and makes the code more readable by indicating that you're working with HashQL symbols.

#![expect(non_upper_case_globals)]
use super::Symbol;

macro_rules! symbol {
    ($name:ident) => {
        pub const $name: Symbol = Symbol::new_static(stringify!($name));
    };

    ($name:ident : $value:ident) => {
        pub const $name: Symbol = Symbol::new_static(stringify!($value));
    };

    ($name:ident : $value:literal) => {
        pub const $name: Symbol = Symbol::new_static($value);
    };
}

macro_rules! symbols_impl {
    (@munch $name:ident $(, $($rest:tt)*)?) => {
        symbol!($name);
        symbols_impl!(@munch $($($rest)*)?);
    };
    (@munch $name:ident : $value:tt $(, $($rest:tt)*)?) => {
        symbol!($name : $value);
        symbols_impl!(@munch $($($rest)*)?);
    };
    (@munch) => {};
}

macro_rules! symbols {

    ($($tokens:tt)*) => {
        symbols_impl!(@munch $($tokens)*);
    };
}

symbols![
    // Module Names
    special_form,
    kernel,
    r#type: type, // also a kernel special form
    math,
    graph,

    // Kernel Special Forms
    access,
    r#fn: fn,
    r#if: if,
    index,
    input,
    is,
    r#let: let,
    newtype,
    r#use: use,

    // Kernel Types
    BaseUrl,
    Boolean,
    Dict,
    Integer,
    Intersection,
    List,
    Natural,
    Never,
    Null,
    Number,
    Option,
    Result,
    String,
    Struct,
    Tuple,
    Unknown,
    Url,

    // math functions
    add,
    sub,
    mul,
    div,
    r#mod: mod,
    pow,
    bit_and,
    bit_or,
    bit_not,
    left_shift,
    right_shift,
    gt,
    lt,
    gte,
    lte,
    eq,
    ne,
    not,
    and,
    or,

    // Graph module
    Graph,
    SortedGraph,

];
