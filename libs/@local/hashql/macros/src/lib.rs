#![feature(proc_macro_diagnostic, proc_macro_totokens)]

extern crate alloc;
extern crate proc_macro;

mod grammar;
mod id;
mod sym;

use core::fmt::Display;

use proc_macro::{Diagnostic, Level, Span, TokenStream};

/// Derives [`Id`] trait implementations for an enum with unit variants.
///
/// Generates sequential discriminants, conversion methods, and trait
/// implementations. For struct-based Id types, use [`define_id!`] instead.
///
/// The enum must have `#[repr(u8)]` (or the appropriate integer type for the
/// variant count) and derive the standard traits required by [`Id`].
///
/// # Example
///
/// ```ignore
/// #[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, hashql_macros::Id)]
/// #[repr(u8)]
/// pub enum TargetId {
///     Interpreter,
///     Postgres,
///     Embedding,
/// }
/// ```
///
/// By default, a [`Display`] implementation is generated using lowercased
/// variant names.
///
/// # Attributes
///
/// Configuration is passed via `#[id(...)]` helper attributes:
///
/// - `crate = path` — path to the `hashql_core` crate (default: `::hashql_core`)
/// - `const` — add `const` to trait impl blocks
/// - `derive(Step)` — implement [`core::iter::Step`]
/// - `display = "format"` — implement [`Display`] with a format string
/// - `display = !` — suppress the [`Display`] implementation
#[proc_macro_derive(Id, attributes(id))]
pub fn derive_id(item: TokenStream) -> TokenStream {
    id::expand_derive(item.into()).into()
}

/// Defines a struct as an [`Id`] type.
///
/// Creates a newtype wrapper around an integer with a valid range. This is a
/// function-like macro because the struct body syntax (`u32 is 0..=MAX`) is not
/// valid Rust.
///
/// For enum Id types, use `#[derive(Id)]` instead.
///
/// # Example
///
/// ```ignore
/// define_id! {
///     /// A unique node identifier.
///     #[id(derive(Step))]
///     pub struct NodeId(u32 is 0..=0xFFFF_FF00)
/// }
/// ```
///
/// Supported backing types: `u8`, `u16`, `u32`, `u64`, `u128`.
///
/// The range bound determines valid values. Inclusive (`..=`) and exclusive (`..`)
/// ranges are both supported.
///
/// # Attributes
///
/// Placed inside an `#[id(...)]` annotation on the item:
///
/// - `crate = path` — path to the `hashql_core` crate (default: `::hashql_core`)
/// - `const` — add `const` to trait impl blocks
/// - `derive(Step)` — implement [`core::iter::Step`]
/// - `display = "format"` — implement [`Display`] with a format string
/// - `display = !` — suppress the [`Display`] implementation
///
/// By default, a [`Display`] implementation is generated using the inner value.
///
/// # Generated items
///
/// - [`Id`] trait implementation
/// - [`HasId`] trait implementation
/// - [`TryFrom<u32>`], [`TryFrom<u64>`], [`TryFrom<usize>`] implementations
/// - [`Debug`] and (by default) [`Display`] implementations
/// - `new`, `new_unchecked` constructors
#[proc_macro]
pub fn define_id(item: TokenStream) -> TokenStream {
    id::expand_define(item.into()).into()
}

/// Generates a pre-interned symbol table.
///
/// Produces three artifacts from a symbol definition list:
///
/// 1. `SYMBOLS` — a static slice of string values for interner pre-population
/// 2. Symbol constants — `Symbol<'static>` constants with companion `ConstantSymbol` modules
/// 3. `LOOKUP` — a static slice mapping string values to their [`Repr`] for fast lookup
///
/// # Syntax
///
/// ```ignore
/// define_symbols! {
///     foo,                        // simple: name = string value
///     r#true: "true",             // explicit string value
///     symbol: { plus: "+", },     // module grouping
/// }
/// ```
///
/// The call site must have `Symbol` and `ConstantSymbol` in scope (e.g. via
/// `use super::{ConstantSymbol, Symbol}`). The generated `LOOKUP` references
/// `super::repr::Repr`.
#[proc_macro]
pub fn define_symbols(item: TokenStream) -> TokenStream {
    sym::expand(item.into()).into()
}

fn emit_error(span: Span, message: impl Display) {
    Diagnostic::spanned(span, Level::Error, message.to_string()).emit();
}
