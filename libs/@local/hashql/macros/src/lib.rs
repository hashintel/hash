#![feature(proc_macro_diagnostic, proc_macro_totokens)]

extern crate alloc;
extern crate proc_macro;

mod grammar;
mod id;
mod sym;

use core::fmt::Display;

use proc_macro::{Diagnostic, Level, Span, TokenStream};

/// Defines an enum as an [`Id`] type.
///
/// This attribute macro works on enums with unit variants, generating sequential
/// discriminants, conversion methods, and trait implementations.
///
/// For struct-based Id types, use [`define_id!`] instead, since attribute macros
/// require syntactically valid Rust on the annotated item.
///
/// # Example
///
/// ```ignore
/// #[hashql_macros::id]
/// pub enum TargetId {
///     Interpreter,
///     Postgres,
///     Embedding,
/// }
/// ```
///
/// # Attributes
///
/// Attributes can be passed either as arguments to `#[id(...)]` or as a
/// separate `#[id(...)]` attribute on the item:
///
/// - `crate = path` — path to the `hashql_core` crate (default: `::hashql_core`)
/// - `const` — add `const` to trait impl blocks
/// - `derive(Step)` — implement [`core::iter::Step`]
/// - `display = "format"` — implement [`Display`] with a format string
/// - `display = "auto"` — implement [`Display`] using lowercased variant names
/// - `display = !` — suppress the [`Display`] implementation
#[proc_macro_attribute]
pub fn id(attr: TokenStream, item: TokenStream) -> TokenStream {
    id::expand(attr.into(), item.into()).into()
}

/// Defines a type as an [`Id`].
///
/// This is a function-like macro that supports both struct and enum shapes.
/// Struct-based Id types must use this macro because their syntax (`u32 is 0..=MAX`)
/// is not valid Rust, which precludes use of the `#[id]` attribute macro.
///
/// # Struct
///
/// Creates a newtype wrapper around an integer with a valid range:
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
/// # Enum
///
/// Creates an enum with sequential discriminants:
///
/// ```ignore
/// define_id! {
///     pub enum TargetId {
///         Interpreter,
///         Postgres,
///         Embedding,
///     }
/// }
/// ```
///
/// The backing integer type is inferred from the number of variants.
///
/// # Attributes
///
/// Placed inside an `#[id(...)]` annotation on the item:
///
/// - `crate = path` — path to the `hashql_core` crate (default: `::hashql_core`)
/// - `const` — add `const` to trait impl blocks
/// - `derive(Step)` — implement [`core::iter::Step`]
/// - `display = "format"` — implement [`Display`] with a format string
/// - `display = "auto"` — implement [`Display`] using the inner value (struct) or lowercased
///   variant names (enum)
/// - `display = !` — suppress the [`Display`] implementation
///
/// # Generated items
///
/// For both shapes, the macro generates:
/// - [`Id`] trait implementation
/// - [`HasId`] trait implementation
/// - [`TryFrom<u32>`], [`TryFrom<u64>`], [`TryFrom<usize>`] implementations
/// - [`Debug`] and (by default) [`Display`] implementations
///
/// Struct-specific: `new`, `new_unchecked` constructors.
///
/// Enum-specific: `VARIANT_COUNT`, `all`, `try_from_discriminant`,
/// `from_discriminant`, `from_discriminant_unchecked`, `into_discriminant`.
#[proc_macro]
pub fn define_id(item: TokenStream) -> TokenStream {
    id::expand(TokenStream::new().into(), item.into()).into()
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
