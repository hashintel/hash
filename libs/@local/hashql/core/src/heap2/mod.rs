//! Allocator traits for arena allocation.
//!
//! An arena hands out memory that stays valid for a lifetime and then releases all of it together,
//! without running destructors. The traits that allocate take that lifetime as a parameter, written
//! `'alloc`. Write code that allocates as generic over its allocator, and bound the parameter by
//! the capability the code needs:
//!
//! - [`PhaseAllocator`] allocates values and slices that live for `'alloc`. An implementor is an
//!   [`AllocatorPointer`], a shared reference that you take by value.
//! - [`ScopeAllocator`] is an arena that also opens scopes, which release their memory when they
//!   end. Take one as `&mut S` to open scopes with exclusive access. `&S` is a [`PhaseAllocator`].
//! - [`SymbolAllocator`] interns strings as [`Symbol`]s that live for `'alloc`.
//! - [`ResetAllocator`] releases every allocation of an arena at once.
//!
//! [`Scratch`] and [`Heap`] are the arenas of this module. A shared reference to either is a
//! [`PhaseAllocator`], and `&Heap` is also a [`SymbolAllocator`]. Both are a [`ResetAllocator`],
//! and both return their arena as a [`ScopeAllocator`] from `as_scope`. A `Scratch` also returns
//! it from `as_mut_scope`, for scopes with exclusive access.
//!
//! [`Symbol`]: crate::symbol::Symbol
#![expect(unsafe_code)]

mod bump;
mod heap;
mod macros;
mod phase;
mod reset;
mod scope;
mod scratch;
mod symbol;

pub use self::{
    heap::Heap,
    phase::{AllocatorPointer, PhaseAllocator},
    reset::ResetAllocator,
    scope::{ScopeAllocator, Scoped},
    scratch::Scratch,
    symbol::SymbolAllocator,
};
