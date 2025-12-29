mod disjoint;
mod kind;
mod offset;
mod visitor;

use core::{alloc::Allocator, cmp, mem};

use hashql_core::{
    graph::{Successors as _, Traverse as _},
    heap::ResetAllocator,
    id::bit_vec::DenseBitSet,
};

use self::{
    disjoint::DisjointIdSlice,
    kind::ReductionKind,
    visitor::{AdministrativeReductionVisitor, BodyHeader, Callee, State},
};
use crate::{
    body::{Body, basic_block::BasicBlockId, local::LocalVec},
    context::MirContext,
    def::{DefId, DefIdSlice, DefIdVec},
    pass::{
        Changed, ProgramTransformPass, TransformPass, analysis::CallGraph,
        transform::cp::propagate_block_params,
    },
    visit::VisitorMut as _,
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

struct ScratchMemory<'heap, A: Allocator> {
    basic_block_reverse_postorder: Vec<BasicBlockId, A>,
    callees: LocalVec<Option<Callee<'heap>>, A>,
}

impl<'heap, A: Allocator> ScratchMemory<'heap, A> {
    fn new(bodies: &DefIdSlice<Body<'heap>>, alloc: A) -> Self
    where
        A: Clone,
    {
        let mut max_basic_block_len = 0;
        let mut max_local_decl_len = 0;

        for body in bodies {
            max_basic_block_len = cmp::max(max_basic_block_len, body.basic_blocks.len());
            max_local_decl_len = cmp::max(max_local_decl_len, body.local_decls.len());
        }

        Self {
            basic_block_reverse_postorder: Vec::with_capacity_in(
                max_basic_block_len,
                alloc.clone(),
            ),
            callees: LocalVec::with_capacity_in(max_local_decl_len, alloc),
        }
    }

    fn clear(&mut self) {
        self.basic_block_reverse_postorder.clear();
        self.callees.clear();
    }
}

pub struct AdministrativeReduction<A: Allocator> {
    alloc: A,
}

impl<A: Allocator> AdministrativeReduction<A> {
    pub const fn new_in(alloc: A) -> Self {
        Self { alloc }
    }
}

impl<'env, 'heap, A: ResetAllocator> ProgramTransformPass<'env, 'heap>
    for AdministrativeReduction<A>
{
    fn run(
        &mut self,
        context: &mut MirContext<'env, 'heap>,
        bodies: &mut DefIdSlice<Body<'heap>>,
    ) -> Changed {
        self.alloc.reset();

        // first we create a callgraph
        let callgraph = CallGraph::analyze_in(bodies, &self.alloc);
        let reducable = Reducable::new(bodies, &self.alloc);

        // We do not need to run until fix-point, rather we just do reverse postorder, which is
        // sufficient
        let postorder_slice = self.alloc.allocate_slice_uninit(bodies.len());
        let (postorder, rest) =
            postorder_slice.write_iter(callgraph.depth_first_forest_post_order());
        debug_assert!(rest.is_empty());
        postorder.reverse();
        let reverse_postorder = &*postorder;

        let mut scratch = ScratchMemory::new(bodies, &self.alloc);

        let mut changed = Changed::No;

        for &id in reverse_postorder {
            let (body, rest) = DisjointIdSlice::new(bodies, id);

            let mut pass = AdministrativeReductionPass {
                alloc: &self.alloc,
                callgraph: &callgraph,
                reducable: &reducable,
                bodies: rest,
                scratch: &mut scratch,
            };

            changed |= pass.run(context, body);
        }

        changed
    }
}

struct AdministrativeReductionPass<'ctx, 'slice, 'heap, A: Allocator> {
    alloc: A,
    callgraph: &'ctx CallGraph<'heap, A>,
    reducable: &'ctx Reducable<A>,
    bodies: DisjointIdSlice<'slice, DefId, Body<'heap>>,

    scratch: &'ctx mut ScratchMemory<'heap, A>,
}

impl<'env, 'heap, A: Allocator> TransformPass<'env, 'heap>
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

        self.scratch.clear();

        let local_decls = mem::replace(&mut body.local_decls, LocalVec::new_in(context.heap));

        let mut visitor = AdministrativeReductionVisitor {
            heap: context.heap,
            interner: context.interner,
            body: BodyHeader {
                id: body.id,
                local_decls,
            },
            callees: &mut self.scratch.callees,
            bodies: self.bodies.reborrow(),
            reducable: self.reducable,
            state: State::new(),
        };

        self.scratch
            .basic_block_reverse_postorder
            .extend_from_slice(body.basic_blocks.reverse_postorder());
        let mut args = Vec::new_in(&self.alloc);

        // We don't need to run to fix-point, because we already are! We rerun statements we just
        // processed.
        for &id in &self.scratch.basic_block_reverse_postorder {
            for (local, closure) in propagate_block_params(&mut args, body, id, |operand| {
                visitor.try_eval_callee(operand)
            }) {
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
