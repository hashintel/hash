use core::convert::Infallible;
use std::alloc::Allocator;

use hashql_core::{
    heap::{BumpAllocator, TransferInto},
    id::IdVec,
};

use crate::{
    body::{Body, local::LocalVec, operand::Operand, place::Place},
    context::MirContext,
    def::DefId,
    intern::Interner,
    pass::{Changed, TransformPass, analysis::CallGraph, transform::cp::propagate_block_params},
    visit::{VisitorMut, r#mut::filter},
};

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct Closure<'heap> {
    ptr: DefId,
    env: Place<'heap>,
}

struct AdministrativeReduction;

// administrative reduction

impl AdministrativeReduction {}

struct AdministrativeReductionPass<'graph, A: Allocator> {
    alloc: A,
    callgraph: &'graph CallGraph<A>,
}

impl<'env, 'heap, A: BumpAllocator> TransformPass<'env, 'heap>
    for AdministrativeReductionPass<'_, A>
{
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &mut Body<'heap>) -> Changed {
        let mut visitor = AdministrativeReductionVisitor {
            interner: context.interner,
            closures: IdVec::with_capacity_in(body.local_decls.len(), &self.alloc),
            changed: false,
        };

        let reverse_postorder = body
            .basic_blocks
            .reverse_postorder()
            .transfer_into(&self.alloc);
        let mut args = Vec::new_in(&self.alloc);

        for &mut id in reverse_postorder {
            for (local, closure) in
                propagate_block_params(&mut args, body, id, |operand| visitor.try_eval(operand))
            {
                visitor.closures.insert(local, closure);
            }

            Ok(()) =
                visitor.visit_basic_block(id, &mut body.basic_blocks.as_mut_preserving_cfg()[id]);
        }

        visitor.changed.into()
    }
}

struct AdministrativeReductionVisitor<'env, 'heap, A: Allocator> {
    interner: &'env Interner<'heap>,
    closures: LocalVec<Option<Closure<'heap>>, A>,
    changed: bool,
}

impl<'heap, A: Allocator> AdministrativeReductionVisitor<'_, 'heap, A> {
    fn try_eval(&self, operand: Operand<'heap>) -> Option<Closure<'heap>> {
        if let Operand::Place(place) = operand
            && place.projections.is_empty()
            && let Some(&closure) = self.closures.lookup(place.local)
        {
            return Some(closure);
        }

        None
    }
}

impl<'heap, A: Allocator> VisitorMut<'heap> for AdministrativeReductionVisitor<'_, 'heap, A> {
    type Filter = filter::Deep;
    type Residual = Result<Infallible, !>;
    type Result<T>
        = Result<T, !>
    where
        T: 'heap;
}
