//! Dead local elimination pass.
//!
//! This pass removes unused local variables from the body and compacts the remaining locals
//! to eliminate gaps in the ID space. Unlike [`DeadStoreElimination`] which removes dead
//! assignments, this pass physically removes the local declarations themselves.
//!
//! # Algorithm
//!
//! 1. **Liveness analysis**: Visit all statements and terminators to collect locals that are
//!    referenced anywhere in the body (or accept a pre-computed dead set via [`with_dead`]).
//! 2. **Preserve arguments**: Function arguments (the first `body.args` locals) are never
//!    eliminated, even if unreferenced.
//! 3. **Build remapping table**: Assign new contiguous IDs to live locals, preserving relative
//!    order.
//! 4. **Update references**: Rewrite all [`Local`] references throughout the body to use the new
//!    IDs.
//! 5. **Compact**: Partition live locals to the front and truncate.
//!
//! # Usage
//!
//! This pass is typically run internally by [`DeadStoreElimination`]. It can also accept a
//! pre-computed dead set via [`with_dead`] to avoid redundant analysis when the caller already
//! knows which locals are dead.
//!
//! # Example
//!
//! Before (with `_2` unreferenced after DSE removed its assignment):
//! ```text
//! fn body(_0: int) -> int {
//!     locals: [_0: int, _1: int, _2: int]
//!     bb0:
//!         _1 = _0
//!         return _1
//! }
//! ```
//!
//! After (locals compacted, `_2` removed):
//! ```text
//! fn body(_0: int) -> int {
//!     locals: [_0: int, _1: int]
//!     bb0:
//!         _1 = _0
//!         return _1
//! }
//! ```
//!
//! [`DeadStoreElimination`]: super::dse::DeadStoreElimination
//! [`with_dead`]: DeadLocalElimination::with_dead

#[cfg(test)]
mod tests;

use core::convert::Infallible;

use hashql_core::{
    heap::BumpAllocator,
    id::{Id as _, bit_vec::DenseBitSet},
};

use crate::{
    body::{
        Body,
        local::{Local, LocalSlice, LocalVec},
        location::Location,
        place::PlaceContext,
    },
    context::MirContext,
    intern::Interner,
    pass::TransformPass,
    visit::{Visitor, VisitorMut, r#mut::filter},
};

/// Dead local elimination pass.
///
/// Removes unused locals and compacts the local ID space.
#[derive(Debug)]
pub struct DeadLocalElimination<A: BumpAllocator> {
    alloc: A,
    dead: Option<DenseBitSet<Local>>,
}

impl<A: BumpAllocator> DeadLocalElimination<A> {
    /// Creates a new dead local elimination pass.
    ///
    /// The pass will compute which locals are dead by scanning all references in the body.
    #[must_use]
    pub const fn new_in(alloc: A) -> Self {
        Self { dead: None, alloc }
    }

    /// Configures the pass to use a pre-computed dead set instead of computing it.
    ///
    /// This is useful when the caller (e.g., [`DeadStoreElimination`]) already knows which
    /// locals are dead from a more sophisticated analysis.
    ///
    /// [`DeadStoreElimination`]: super::dse::DeadStoreElimination
    #[must_use]
    pub fn with_dead(self, dead: DenseBitSet<Local>) -> Self {
        Self {
            dead: Some(dead),
            alloc: self.alloc,
        }
    }
}

impl<'env, 'heap, A: BumpAllocator> TransformPass<'env, 'heap> for DeadLocalElimination<A> {
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &mut Body<'heap>) {
        self.alloc.reset();

        let mut dead = if let Some(dead) = self.dead.take() {
            dead
        } else {
            let mut visitor = FindDeadLocals::new(body.local_decls.len());
            Ok(()) = visitor.visit_body(body);

            visitor.dead
        };

        // The function args cannot be dead
        for index in 0..body.args {
            dead.remove(Local::new(index));
        }

        let mut remap = LocalVec::new_in(&self.alloc);
        let mut new_id = Local::new(0);
        for old_id in body.local_decls.ids() {
            // Skip dead locals
            if dead.contains(old_id) {
                continue;
            }

            remap.insert(old_id, new_id);
            new_id.increment_by(1);
        }

        let mut visitor = UpdateLiveLocals {
            interner: context.interner,
            remap: &remap,
        };
        Ok(()) = visitor.visit_body_preserving_cfg(body);

        // For an explanation of how this compression algorithm works, see the DBE implementation.
        let mut write_index = Local::new(0);
        let local_count = Local::new(body.local_decls.len() - dead.count());

        for read_index in body.local_decls.ids() {
            if write_index == local_count {
                // All locals have been written, so we can stop early.
                break;
            }

            if dead.contains(read_index) {
                continue;
            }

            body.local_decls.swap(write_index, read_index);
            write_index.increment_by(1);
        }

        // Remove unused locals
        body.local_decls.truncate(write_index);
    }
}

/// Visitor that identifies dead locals by visiting all local references.
///
/// Starts with all locals marked as dead, then removes from the dead set any local that
/// is actually referenced. After visiting, the remaining locals in `dead` are truly unused.
struct FindDeadLocals {
    dead: DenseBitSet<Local>,
}

impl FindDeadLocals {
    fn new(domain_size: usize) -> Self {
        Self {
            dead: DenseBitSet::new_filled(domain_size),
        }
    }
}

impl Visitor<'_> for FindDeadLocals {
    type Result = Result<(), !>;

    fn visit_local(&mut self, _: Location, _: PlaceContext, local: Local) -> Self::Result {
        self.dead.remove(local);
        Ok(())
    }
}

/// Visitor that rewrites [`Local`] references using a remapping table.
struct UpdateLiveLocals<'slice, 'env, 'heap> {
    interner: &'env Interner<'heap>,
    remap: &'slice LocalSlice<Option<Local>>,
}

impl<'heap> VisitorMut<'heap> for UpdateLiveLocals<'_, '_, 'heap> {
    type Filter = filter::Deep;
    type Residual = Result<Infallible, !>;
    type Result<T>
        = Result<T, !>
    where
        T: 'heap;

    fn interner(&self) -> &Interner<'heap> {
        self.interner
    }

    fn visit_local(&mut self, _: Location, _: PlaceContext, local: &mut Local) -> Self::Result<()> {
        let &remap = self
            .remap
            .lookup(*local)
            .unwrap_or_else(|| unreachable!("every live local must have a new id"));

        *local = remap;
        Ok(())
    }
}
