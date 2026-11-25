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
//! ```
//! use hashql_core::heap::{Heap, PhaseAllocator, ScopeAllocator as _, SymbolAllocator as _};
//!
//! // Generic code names the capability it needs, and what it returns lives for `'alloc`.
//! fn squares<'alloc, A>(alloc: A, values: &[u32]) -> &'alloc [u32]
//! where
//!     A: PhaseAllocator<'alloc>,
//! {
//!     let squares = alloc.alloc_slice_copy(values);
//!     for value in &mut *squares {
//!         *value *= *value;
//!     }
//!
//!     squares
//! }
//!
//! let mut heap = Heap::new();
//! assert_eq!(squares(&heap, &[1, 2, 3]), [1, 4, 9]);
//!
//! let mut arena = heap.as_mut_scope();
//! let name = arena.alloc_symbol("total price");
//!
//! // A scope releases what it allocated when its closure returns. The symbol lives in the heap
//! // itself and stays valid.
//! let sum: u32 = arena.scoped(|scope| squares(&scope, &[1, 2, 3]).iter().sum());
//!
//! assert_eq!(sum, 14);
//! assert_eq!(name.as_str(), "total price");
//! ```
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
#[expect(
    clippy::module_inception,
    reason = "the module holds the `Heap` type and takes its name"
)]
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

use alloc::{boxed, vec};

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

/// A [`Box`](boxed::Box) that allocates from a [`Heap`].
///
/// Write the type as `heap::Box`, which tells it apart from the `Box` of the standard library.
pub type Box<'heap, T> = boxed::Box<T, &'heap Heap>;

/// A [`Vec`](vec::Vec) that allocates from a [`Heap`].
///
/// Write the type as `heap::Vec`, which tells it apart from the `Vec` of the standard library.
pub type Vec<'heap, T> = vec::Vec<T, &'heap Heap>;
