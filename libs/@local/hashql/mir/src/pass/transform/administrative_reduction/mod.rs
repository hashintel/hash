use core::{
    alloc::Allocator,
    convert::Infallible,
    marker::PhantomData,
    mem,
    ops::{Index, IndexMut},
    usize,
};

use hashql_core::{
    graph::{Successors, Traverse, algorithms::Tarjan},
    heap::{BumpAllocator, Heap, TransferInto as _},
    id::{Id, IdSlice, IdVec, bit_vec::DenseBitSet},
};

use crate::{
    body::{
        Body, Source,
        basic_block::{BasicBlock, BasicBlockId},
        constant::Constant,
        local::{Local, LocalDecl, LocalVec},
        location::Location,
        operand::Operand,
        place::{FieldIndex, Place, PlaceContext, ProjectionKind},
        rvalue::{Aggregate, AggregateKind, Apply, ArgIndex, RValue},
        statement::{Assign, Statement, StatementKind},
        terminator::{Return, TerminatorKind},
    },
    context::MirContext,
    def::{DefId, DefIdSlice, DefIdVec},
    intern::Interner,
    pass::{
        AnalysisPass, Changed, TransformPass,
        analysis::{CallGraph, CallGraphAnalysis},
        transform::cp::propagate_block_params,
    },
    visit::{self, VisitorMut, r#mut::filter},
};

struct SplitIdSlice<'slice, I, T> {
    left: &'slice mut [T],
    right: &'slice mut [T],

    _marker: PhantomData<fn(&I)>,
}

impl<'slice, I, T> SplitIdSlice<'slice, I, T>
where
    I: Id,
{
    fn new(slice: &'slice mut IdSlice<I, T>, at: I) -> (&'slice mut T, Self) {
        let (left, right) = slice.as_raw_mut().split_at_mut(at.as_usize());
        let [mid, right @ ..] = right else {
            unreachable!("right slice is always non-empty")
        };

        (
            mid,
            Self {
                left,
                right,
                _marker: PhantomData,
            },
        )
    }
}

impl<'slice, I, T> Index<I> for SplitIdSlice<'slice, I, T>
where
    I: Id,
{
    type Output = T;

    fn index(&self, index: I) -> &Self::Output {
        assert!(index.as_usize() != self.left.len(), "index out of bounds");

        if index.as_usize() < self.left.len() {
            &self.left[index.as_usize()]
        } else {
            &self.right[index.as_usize() - self.left.len() - 1]
        }
    }
}

impl<I, T> IndexMut<I> for SplitIdSlice<'_, I, T>
where
    I: Id,
{
    fn index_mut(&mut self, index: I) -> &mut Self::Output {
        assert!(index.as_usize() != self.left.len(), "index out of bounds");

        if index.as_usize() < self.left.len() {
            &mut self.left[index.as_usize()]
        } else {
            &mut self.right[index.as_usize() - self.left.len() - 1]
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
enum Target {
    TrivialThunk,
    ClosureForwarding,
}

impl Target {
    fn is_trivial_statements(statements: &[Statement<'_>]) -> bool {
        statements.iter().all(|statement| match statement.kind {
            StatementKind::Nop
            | StatementKind::Assign(Assign {
                lhs: _,
                rhs: RValue::Aggregate(_) | RValue::Load(_),
            }) => true,
            StatementKind::Assign(Assign {
                lhs: _,
                rhs: RValue::Apply(_) | RValue::Binary(_) | RValue::Unary(_) | RValue::Input(_),
            })
            | StatementKind::StorageLive(_)
            | StatementKind::StorageDead(_) => false,
        })
    }

    fn analyze_thunk(body: &Body<'_>) -> Option<Self> {
        // We can't have any control-flow, therefore only one bb allowed
        if body.basic_blocks.len() > 1 {
            return None;
        }

        let bb = &body.basic_blocks[BasicBlockId::START];

        // StorageLive and StorageDead are invalid on purpose, this is because them being in a thunk
        // signifies that we have already done liveness analysis.
        let is_trivial = Self::is_trivial_statements(&bb.statements);

        // The return value of the thunk **must** be a return
        if !matches!(bb.terminator.kind, TerminatorKind::Return(_)) {
            return None;
        }

        if is_trivial {
            return Some(Self::TrivialThunk);
        }

        None
    }

    fn analyze_closure(body: &Body<'_>) -> Option<Self> {
        // A closure is forwarding in the following cases:
        // 1) The last statement is a closure call
        // 2) Everything leading up to the last statement is considered trivial
        // 3) The return value is the result of the closure call

        // Unlike `analyze_thunk` this is applicable to *any* closure, not just thunks.
        if body.basic_blocks.len() > 1 {
            return None;
        }

        let bb = &body.basic_blocks[BasicBlockId::START];

        // An empty closure is not forwarding
        let [prelude @ .., closure] = &*bb.statements else {
            // An empty basic block is not forwarding, it is considered trivial
            return None;
        };

        if !Self::is_trivial_statements(prelude) {
            return None;
        }

        let StatementKind::Assign(Assign {
            lhs,
            rhs: RValue::Apply(_),
        }) = closure.kind
        else {
            return None;
        };

        if bb.terminator.kind
            == TerminatorKind::Return(Return {
                value: Operand::Place(lhs),
            })
        {
            return Some(Self::ClosureForwarding);
        }

        None
    }

    fn analyze(body: &Body<'_>) -> Option<Self> {
        // A trivial thunk is one that is a thunk that has a single body, with only trivial
        // assignments, and then returns such a value. So no control-flow.
        // A trivial thunk may create aggregates, but not operate on them, so bin and unops are not
        // allowed.

        // TODO: should we expand the scope here to allow non-thunks to allow as thunks?!
        if matches!(body.source, Source::Thunk(_, _))
            && let Some(target) = Self::analyze_thunk(body)
        {
            return Some(target);
        }

        Self::analyze_closure(body)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct Closure<'heap> {
    ptr: DefId,
    env: Place<'heap>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct Function {
    ptr: DefId,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum Pointer<'heap> {
    Thin(Function),
    Fat(Closure<'heap>),
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

        let mut targets = DefIdVec::with_capacity_in(bodies.len(), &self.alloc);
        let mut target_bitset = DenseBitSet::new_empty(bodies.len());
        for (id, body) in bodies.iter_enumerated() {
            if let Some(target) = Target::analyze(body) {
                targets.insert(id, target);
                target_bitset.insert(id);
            }
        }

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
            let (body, rest) = SplitIdSlice::new(bodies, id);

            let mut pass = AdministrativeReductionPass {
                alloc: &self.alloc,
                callgraph: &callgraph,
                targets: &targets,
                target_bitset: &target_bitset,
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
    targets: &'ctx DefIdSlice<Option<Target>>,
    target_bitset: &'ctx DenseBitSet<DefId>,
    bodies: SplitIdSlice<'slice, DefId, Body<'heap>>,
}

impl<'env, 'heap, A: BumpAllocator> TransformPass<'env, 'heap>
    for AdministrativeReductionPass<'_, '_, 'heap, A>
{
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &mut Body<'heap>) -> Changed {
        // check if we even have *any* outgoing edge to a target, if not, skip
        if self
            .callgraph
            .successors(body.id)
            .all(|successor| self.target_bitset.contains(successor))
        {
            // Nothing to do, because we don't have an edge to a target
            return Changed::No;
        }

        let mut local_decls = mem::replace(&mut body.local_decls, LocalVec::new_in(context.heap));

        let mut visitor = AdministrativeReductionVisitor {
            current: body.id,
            interner: context.interner,
            pointers: IdVec::with_capacity_in(body.local_decls.len(), &self.alloc),
            targets: self.targets,
            changed: true, // indicator inside the loop, therefore first true
            lhs: Place::SYNTHETIC,
            heap: context.heap,
            local_decl: &mut local_decls,
            bodies: &mut self.bodies,
            current_target: None,
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
                visitor.pointers.insert(local, closure);
            }

            Ok(()) =
                visitor.visit_basic_block(id, &mut body.basic_blocks.as_mut_preserving_cfg()[id]);
        }

        let changed = visitor.changed;
        body.local_decls = local_decls;

        changed.into()
    }
}

struct AdministrativeReductionVisitor<'ctx, 'body, 'env, 'heap, A: Allocator> {
    heap: &'heap Heap,
    current: DefId,
    local_decl: &'ctx mut LocalVec<LocalDecl<'heap>, &'heap Heap>,
    interner: &'env Interner<'heap>,
    pointers: LocalVec<Option<Pointer<'heap>>, A>,
    targets: &'ctx DefIdSlice<Option<Target>>,
    changed: bool,
    lhs: Place<'heap>,
    bodies: &'ctx mut SplitIdSlice<'body, DefId, Body<'heap>>,
    current_target: Option<(DefId, Target, IdVec<ArgIndex, Operand<'heap>, &'heap Heap>)>,
}

impl<'heap, A: Allocator> AdministrativeReductionVisitor<'_, '_, '_, 'heap, A> {
    fn try_eval(&self, operand: Operand<'heap>) -> Option<Pointer<'heap>> {
        if let Operand::Constant(Constant::FnPtr(ptr)) = operand {
            return Some(Pointer::Thin(Function { ptr }));
        }

        let Operand::Place(place) = operand else {
            return None;
        };

        let &pointer = self.pointers.lookup(place.local)?;

        if place.projections.is_empty() {
            return Some(pointer);
        }

        // Degrade to a thin pointer if the projection is a field access to the first field
        if place.projections.len() == 1
            && place.projections[0].kind == ProjectionKind::Field(FieldIndex::new(0))
            && let Pointer::Fat(Closure { ptr, env: _ }) = pointer
        {
            return Some(Pointer::Thin(Function { ptr }));
        }

        None
    }

    fn try_eval_ptr(&self, operand: Operand<'heap>) -> Option<DefId> {
        if let Operand::Constant(Constant::FnPtr(ptr)) = operand {
            return Some(ptr);
        }

        let Operand::Place(place) = operand else {
            return None;
        };

        let &pointer = self.pointers.lookup(place.local)?;

        match pointer {
            Pointer::Thin(Function { ptr }) if place.projections.is_empty() => Some(ptr),
            Pointer::Fat(Closure { ptr, env: _ })
                if place.projections.len() == 1
                    && place.projections[0].kind == ProjectionKind::Field(FieldIndex::new(0)) =>
            {
                Some(ptr)
            }
            _ => None,
        }
    }
}

impl<'heap, A: Allocator> VisitorMut<'heap>
    for AdministrativeReductionVisitor<'_, '_, '_, 'heap, A>
{
    type Filter = filter::Deep;
    type Residual = Result<Infallible, !>;
    type Result<T>
        = Result<T, !>
    where
        T: 'heap;

    fn interner(&self) -> &Interner<'heap> {
        self.interner
    }

    fn visit_statement_assign(
        &mut self,
        location: Location,
        assign: &mut Assign<'heap>,
    ) -> Self::Result<()> {
        self.lhs = assign.lhs;
        debug_assert!(self.lhs.projections.is_empty(), "MIR must be in SSA form");

        visit::r#mut::walk_statement_assign(self, location, assign)
    }

    fn visit_rvalue(&mut self, location: Location, rvalue: &mut RValue<'heap>) -> Self::Result<()> {
        if let &mut RValue::Load(load) = rvalue
            && let Some(ptr) = self.try_eval_ptr(load)
        {
            self.pointers
                .insert(self.lhs.local, Pointer::Thin(Function { ptr }));
        }

        visit::r#mut::walk_rvalue(self, location, rvalue)
    }

    fn visit_rvalue_aggregate(
        &mut self,
        _: Location,
        aggregate: &mut Aggregate<'heap>,
    ) -> Self::Result<()> {
        // We do not descend further, because we won't need to.
        if aggregate.kind != AggregateKind::Closure {
            return Ok(());
        }

        let &[Operand::Constant(Constant::FnPtr(ptr)), Operand::Place(env)] =
            &aggregate.operands[..]
        else {
            unreachable!(
                "Closure must have exactly two operands, with the first being a function pointer \
                 and the second being a place to the environment."
            )
        };

        self.pointers
            .insert(self.lhs.local, Pointer::Fat(Closure { ptr, env }));

        Ok(())
    }

    fn visit_rvalue_apply(&mut self, _: Location, apply: &mut Apply<'heap>) -> Self::Result<()> {
        // Closure devirt, there are two cases which we can resolve:
        // Nothing to do here, this is because we *must* look at a closure here.
        let Some(ptr) = self.try_eval_ptr(apply.function) else {
            return Ok(());
        };

        if ptr == self.current {
            // We can't reduce a closure to itself, so we just return Ok(())
            return Ok(());
        }

        // We now know the closure, we now must check if it is an eligible target for administrative
        // reduction
        let Some(&target) = self.targets.lookup(ptr) else {
            return Ok(());
        };

        let arguments = mem::replace(&mut apply.arguments, IdVec::new_in(self.heap));

        // The target dictates how we reduce the closure, if it's closure forwarding, we simply
        // replace the closure (and add any prelude required) if it's a trivial thunk, we
        // simply inline, and replace the return with an assignment to our value.
        // Either way we add some locals, which are removed in subsequent passes.
        self.current_target = Some((ptr, target, arguments));

        Ok(())
    }

    fn visit_basic_block(
        &mut self,
        id: BasicBlockId,
        BasicBlock {
            params,
            statements,
            terminator,
        }: &mut BasicBlock<'heap>,
    ) -> Self::Result<()> {
        let mut location = Location {
            block: id,
            statement_index: 0,
        };

        // We do not visit the basic block id here because it **cannot** be changed
        self.visit_basic_block_params(location, params)?;

        while location.statement_index < statements.len() {
            let statement = &mut statements[location.statement_index];
            location.statement_index += 1; // one based, so we must offset accordingly **before** we run

            self.visit_statement(location, statement)?;
            if let Some((ptr, _, arguments)) = self.current_target.take() {
                let statement_span = statement.span;
                // In both cases the result is very straightforward, we simply merge the targets
                // statements, and assign the result, then re-process. subsequent passes inside the
                // fix-point iteration loop will handle the rest.

                // A trivial thunk is a replacement
                let target = &self.bodies[ptr];
                debug_assert_eq!(target.basic_blocks.len(), 1);
                let target_bb = &target.basic_blocks[BasicBlockId::START];

                let TerminatorKind::Return(Return { mut value }) = target_bb.terminator.kind else {
                    unreachable!(
                        "a thunk is only trivial if it has a return inside of a single bb"
                    );
                };

                let local_offset = self.local_decl.len();
                self.local_decl.extend_from_slice(&target.local_decls);

                let mut offset_visitor = OffsetLocalVisitor {
                    interner: self.interner,
                    offset: local_offset,
                };

                // We change our statement to be one, that assigns the place to that local
                offset_visitor.visit_operand(location, &mut value);
                statement.kind = StatementKind::Assign(Assign {
                    lhs: self.lhs,
                    rhs: RValue::Load(value),
                });

                // Any statements are *prepended* to our current body, once that is done, we
                // offset these, and decrement the clock, to allow our optimization to run.
                let offset = location.statement_index - 1;
                let length = target_bb.statements.len() + target.args;

                // If there are any arguments, also create some statements that bind the arguments
                // (without offset because the offset visitor is going to look over them)
                debug_assert_eq!(arguments.len(), target.args);
                for (param, argument) in arguments.into_iter().enumerate() {
                    statements.push(Statement {
                        kind: StatementKind::Assign(Assign {
                            lhs: Place::local(Local::new(param), self.interner),
                            rhs: RValue::Load(argument),
                        }),
                        span: statement_span,
                    });
                }

                statements.splice(offset..offset, target_bb.statements.iter().cloned());

                for (offset, statement) in
                    statements[offset..offset + length].iter_mut().enumerate()
                {
                    let mut location = location;
                    location.statement_index += offset;

                    offset_visitor.visit_statement(location, statement);
                }

                location.statement_index -= 1;
            }
        }

        self.visit_terminator(location, terminator)?;

        Ok(())
    }
}

struct OffsetLocalVisitor<'env, 'heap> {
    interner: &'env Interner<'heap>,
    offset: usize,
}

impl<'env, 'heap> VisitorMut<'heap> for OffsetLocalVisitor<'env, 'heap> {
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
        local.increment_by(self.offset);
        Ok(())
    }
}
