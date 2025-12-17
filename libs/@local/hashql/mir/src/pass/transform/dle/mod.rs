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

#[derive(Debug)]
pub struct DeadLocalElimination<A: BumpAllocator> {
    alloc: A,
    dead: Option<DenseBitSet<Local>>,
}

impl<A: BumpAllocator> DeadLocalElimination<A> {
    #[must_use]
    pub const fn new_in(alloc: A) -> Self {
        Self { dead: None, alloc }
    }

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

        let dead = if let Some(dead) = self.dead.take() {
            dead
        } else {
            let mut visitor = FindDeadLocals::new(body.local_decls.len());
            Ok(()) = visitor.visit_body(body);

            visitor.dead
        };

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
