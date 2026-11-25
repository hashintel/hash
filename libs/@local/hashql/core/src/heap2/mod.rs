//! Allocator traits for arena allocation.
//!
//! An arena hands out memory that stays valid for a lifetime and then releases all of it together,
//! without running destructors. The traits that allocate take that lifetime as a parameter, written
//! `'alloc`. Write code that allocates as generic over its allocator, and bound the parameter by
//! the capability the code needs:
//!
//! - [`PhaseAllocator`] allocates values and slices that live for `'alloc`.
//! - [`ScopeAllocator`] also opens scopes, which release their memory when they end.
//! - [`SymbolAllocator`] interns strings as [`Symbol`]s that live for `'alloc`.
//! - [`ResetAllocator`] releases every allocation of an arena at once.
//!
//! [`Symbol`]: crate::symbol::Symbol
#![expect(unsafe_code)]

mod bump;
mod macros;
mod phase;
mod reset;
mod scope;
mod symbol;

pub use self::{
    phase::PhaseAllocator,
    reset::ResetAllocator,
    scope::{ScopeAllocator, Scoped},
    symbol::SymbolAllocator,
};
