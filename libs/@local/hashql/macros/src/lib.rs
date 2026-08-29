#![feature(proc_macro_diagnostic)]

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
/// Creates a newtype wrapper around an integer, optionally restricted to a
/// valid range. This is a function-like macro because the struct body syntax
/// (`u32 is 0..=MAX`) is not valid Rust.
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
/// An id stored as its little-endian byte encoding, suitable for reading and
/// writing file formats without conversion:
///
/// ```ignore
/// define_id! {
///     /// A row in the node table.
///     #[id(endian = little, unaligned)]
///     pub struct NodeRowId(u64)
/// }
/// ```
///
/// Supported backing types: `u8`, `u16`, `u32`, `u64`, `u128`. `usize` is
/// intentionally excluded: proc macros are compiled for and run on the host,
/// so they cannot determine the target's pointer width. This makes it
/// impossible to select the correct widening cast for range assertions during
/// cross-compilation.
///
/// The `is` bounds clause is optional. With bounds, valid values are limited
/// to the given range. Inclusive (`..=`) and exclusive (`..`) ranges are both
/// supported. Without bounds, every value of the backing type is valid: `new`
/// is total, no `new_unchecked` is generated, and conversions only reject
/// values the backing type cannot hold.
///
/// # Attributes
///
/// Placed inside an `#[id(...)]` annotation on the item:
///
/// - `crate = path`: path to the `hashql_core` crate (default: `::hashql_core`)
/// - `const`: add `const` to trait impl blocks
/// - `derive(Step)`: implement [`core::iter::Step`]
/// - `display = "format"`: implement [`Display`] with a format string
/// - `display = !`: suppress the [`Display`] implementation
/// - `unaligned`: store the id as its byte encoding with alignment 1
/// - `endian = little` / `endian = big` / `endian = native`: byte order of the stored value
///   (default: `native`). Requires `unaligned`
///
/// By default, a [`Display`] implementation is generated using the inner value.
///
/// # Byte-encoded ids
///
/// With `unaligned`, the id stores its value as a byte array with alignment 1
/// and implements zerocopy's byte traits (`IntoBytes`, `Immutable`,
/// `Unaligned`, `KnownLayout`, plus `ByteEq` and `ByteHash`), so slices of ids
/// can be reinterpreted directly from file or wire bytes. `endian` pins the
/// byte order of that encoding; `endian = little` and `endian = big` make the
/// encoding identical on every target, which is what a persisted format needs.
/// Comparison and ordering always follow the numeric value, never the byte
/// encoding. The calling crate must depend on `zerocopy` with the `derive`
/// feature. `u8` accepts `unaligned` (a single byte is its own encoding) but
/// has no byte order to pin.
///
/// The byte-source trait follows the bounds: an unbounded id implements
/// `FromBytes` (every bit pattern is a valid id), while a range-bounded id
/// implements `TryFromBytes` with the range as its validity predicate, so
/// fallible reads reject out-of-range bytes and infallible byte constructors
/// do not exist for it.
///
/// # Generated items
///
/// - [`Id`] trait implementation
/// - `HasId` trait implementation
/// - [`TryFrom<u32>`], [`TryFrom<u64>`], [`TryFrom<usize>`] implementations
/// - [`Debug`] and (by default) [`Display`] implementations
/// - `new` constructor, plus `new_unchecked` for range-bounded ids
/// - `get` accessor returning the raw scalar at its native width
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
/// 3. `LOOKUP` — a static slice mapping string values to their `Repr` for fast lookup
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
