mod disjoint;
mod kind;
mod offset;
mod visitor;

use core::{
    alloc::Allocator,
    convert::Infallible,
    marker::PhantomData,
    mem,
    ops::{Index, IndexMut},
    usize,
};

use hashql_core::{
    graph::{Successors, Traverse},
    heap::{BumpAllocator, Heap, TransferInto as _},
    id::{Id, IdSlice, IdVec, bit_vec::DenseBitSet},
};

use self::{
    disjoint::DisjointIdSlice,
    kind::ReductionKind,
    visitor::{AdministrativeReductionVisitor, BodyHeader, State},
};
use crate::{
    body::{Body, local::LocalVec, place::Place},
    context::MirContext,
    def::{DefId, DefIdSlice, DefIdVec},
    pass::{
        AnalysisPass, Changed, TransformPass, analysis::CallGraph,
        transform::cp::propagate_block_params,
    },
    visit::VisitorMut,
};

struct Reducable<A: Allocator> {
    inner: DefIdVec<Option<ReductionKind>, A>,
    set: DenseBitSet<DefId>,
}

impl<A: Allocator> Reducable<A> {
    fn new(bodies: &DefIdSlice<Body<'_>>, alloc: A) -> Self {
        let mut this = Self {
            inner: DefIdVec::with_capacity_in(bodies.len(), alloc),
            set: DenseBitSet::new_empty(bodies.len()),
        };

        for body in bodies {
            this.insert(body);
        }

        this
    }

    fn insert(&mut self, body: &Body<'_>) -> bool {
        let Some(kind) = ReductionKind::of(body) else {
            return false;
        };

        self.inner.insert(body.id, kind);
        self.set.insert(body.id);

        true
    }

    fn get(&self, id: DefId) -> Option<ReductionKind> {
        self.inner.lookup(id).copied()
    }

    fn contains(&self, id: DefId) -> bool {
        self.set.contains(id)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum Callee<'heap> {
    Fn { ptr: DefId },
    Closure { ptr: DefId, env: Place<'heap> },
}

struct AdministrativeReduction<A: Allocator> {
    alloc: A,
}

impl<A: BumpAllocator> AdministrativeReduction<A> {
    pub fn run<'env, 'heap>(
        &self,
        context: &mut MirContext<'env, 'heap>,
        bodies: &mut DefIdSlice<Body<'heap>>,
    ) -> Changed {
        // first we create a callgraph
        let mut callgraph = CallGraph::analyze_in(bodies, &self.alloc);
        let mut reducable = Reducable::new(bodies, &self.alloc);

        // We do not need to run until fix-point, rather we just do reverse postorder, which is
        // sufficient
        let postorder_slice = self.alloc.allocate_slice_uninit(bodies.len());
        let (postorder, rest) =
            postorder_slice.write_iter(callgraph.depth_first_forest_post_order());
        debug_assert!(rest.is_empty());
        postorder.reverse();
        let reverse_postorder = &*postorder;

        let mut changed = Changed::No;
        for &id in reverse_postorder {
            let (body, rest) = DisjointIdSlice::new(bodies, id);

            let mut pass = AdministrativeReductionPass {
                alloc: &self.alloc,
                callgraph: &callgraph,
                reducable: &reducable,
                bodies: rest,
            };

            changed |= pass.run(context, body);
        }

        changed
    }
}

// administrative reduction

struct AdministrativeReductionPass<'ctx, 'slice, 'heap, A: Allocator> {
    alloc: A,
    callgraph: &'ctx CallGraph<'heap, A>,
    reducable: &'ctx Reducable<A>,
    bodies: DisjointIdSlice<'slice, DefId, Body<'heap>>,
}

impl<'env, 'heap, A: BumpAllocator> TransformPass<'env, 'heap>
    for AdministrativeReductionPass<'_, '_, 'heap, A>
{
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &mut Body<'heap>) -> Changed {
        // check if we even have *any* outgoing edge to a target, if not, skip
        if self
            .callgraph
            .successors(body.id)
            .all(|successor| self.reducable.contains(successor))
        {
            // Nothing to do, because we don't have an edge to a target
            return Changed::No;
        }

        let local_decls = mem::replace(&mut body.local_decls, LocalVec::new_in(context.heap));
        let local_decls_len = local_decls.len();

        let mut visitor = AdministrativeReductionVisitor {
            heap: context.heap,
            interner: context.interner,
            body: BodyHeader {
                id: body.id,
                local_decls,
            },
            callees: LocalVec::with_capacity_in(local_decls_len, &self.alloc),
            bodies: self.bodies.reborrow(),
            reducable: self.reducable,
            state: State::new(),
        };

        let reverse_postorder = &*body
            .basic_blocks
            .reverse_postorder()
            .transfer_into(&self.alloc);
        let mut args = Vec::new_in(&self.alloc);

        // We don't need to run to fix-point, because we already are! We rerun statements we just
        // processed.
        for &id in reverse_postorder {
            for (local, closure) in
                propagate_block_params(&mut args, body, id, |operand| visitor.try_eval(operand))
            {
                visitor.callees.insert(local, closure);
            }

            Ok(()) =
                visitor.visit_basic_block(id, &mut body.basic_blocks.as_mut_preserving_cfg()[id]);
        }

        let changed = visitor.state.changed;
        body.local_decls = visitor.body.local_decls;

        changed.into()
    }
}
