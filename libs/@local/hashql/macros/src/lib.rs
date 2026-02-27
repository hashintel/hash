#![feature(proc_macro_diagnostic, proc_macro_totokens)]
#![recursion_limit = "512"]

extern crate proc_macro;

mod grammar;
mod id;

use proc_macro::{Diagnostic, TokenStream};

/// Defines a type as an [`Id`].
///
/// Supports two shapes:
///
/// **Struct** (newtype wrapper around an integer with a valid range):
/// ```ignore
/// #[hashql_core::id]
/// #[id(steppable)]
/// pub struct NodeId(u32 is 0..=0xFFFF_FF00);
/// ```
///
/// **Enum** (unit variants mapped to sequential discriminants):
/// ```ignore
/// #[hashql_core::id]
/// pub enum TargetId {
///     Interpreter,
///     Postgres,
///     Embedding,
/// }
/// ```
#[proc_macro_attribute]
pub fn id(attr: TokenStream, item: TokenStream) -> TokenStream {
    id::expand(attr, item)
}
