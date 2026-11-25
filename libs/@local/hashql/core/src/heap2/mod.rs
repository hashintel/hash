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
//! and both return their arena as a [`ScopeAllocator`] from `as_scope`, and from `as_mut_scope` for
//! scopes with exclusive access. A [`Pool`] hands out arenas to code that allocates on more than
//! one thread.
//!
//! These traits take an allocator where the std trait of the same purpose uses the global one:
//!
//! - [`CloneIn`] for [`Clone`]
//! - [`FromIn`] and [`IntoIn`] for [`From`] and [`Into`]
//! - [`FromIteratorIn`] and [`CollectIn`] for [`FromIterator`] and [`Iterator::collect`]
//! - [`TransferInto`] for [`ToOwned`], with an arena as the destination
//!
//! [`Symbol`]: crate::symbol::Symbol
#![expect(unsafe_code)]

mod bump;
mod clone;
mod convert;
mod heap;
mod iter;
mod macros;
mod phase;
mod pool;
mod reset;
mod scope;
mod scratch;
mod symbol;
mod transfer;

pub use self::{
    bump::BumpScope,
    clone::CloneIn,
    convert::{FromIn, IntoIn},
    heap::{Heap, HeapScope},
    iter::{CollectIn, FromIteratorIn},
    phase::{AllocatorPointer, PhaseAllocator},
    pool::{Pool, PoolGuard},
    reset::ResetAllocator,
    scope::{ScopeAllocator, Scoped},
    scratch::Scratch,
    symbol::SymbolAllocator,
    transfer::TransferInto,
};
