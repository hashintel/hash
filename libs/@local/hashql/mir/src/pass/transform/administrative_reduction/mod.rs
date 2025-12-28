use core::convert::Infallible;
use std::alloc::Allocator;

use hashql_core::{
    heap::{BumpAllocator, TransferInto},
    id::IdVec,
};

use crate::{
    body::{
        Body, Source,
        basic_block::BasicBlockId,
        constant::Constant,
        local::LocalVec,
        location::Location,
        operand::Operand,
        place::{FieldIndex, Place, ProjectionKind},
        rvalue::{Aggregate, AggregateKind, Apply, RValue},
        statement::{Assign, Statement, StatementKind},
        terminator::{Return, TerminatorKind},
    },
    context::MirContext,
    def::{DefId, DefIdSlice, DefIdVec},
    intern::Interner,
    pass::{Changed, TransformPass, analysis::CallGraph, transform::cp::propagate_block_params},
    visit::{self, VisitorMut, r#mut::filter},
};

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

struct AdministrativeReduction;

// administrative reduction

impl AdministrativeReduction {}

struct AdministrativeReductionPass<'ctx, A: Allocator> {
    alloc: A,
    callgraph: &'ctx CallGraph<A>,
    targets: &'ctx DefIdSlice<Option<Target>>,
}

impl<'env, 'heap, A: BumpAllocator> TransformPass<'env, 'heap>
    for AdministrativeReductionPass<'_, A>
{
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &mut Body<'heap>) -> Changed {
        let mut visitor = AdministrativeReductionVisitor {
            current: body.id,
            interner: context.interner,
            pointers: IdVec::with_capacity_in(body.local_decls.len(), &self.alloc),
            targets: self.targets,
            changed: false,
            lhs: Place::SYNTHETIC,
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
                visitor.pointers.insert(local, closure);
            }

            Ok(()) =
                visitor.visit_basic_block(id, &mut body.basic_blocks.as_mut_preserving_cfg()[id]);
        }

        visitor.changed.into()
    }
}

struct AdministrativeReductionVisitor<'ctx, 'env, 'heap, A: Allocator> {
    current: DefId,
    interner: &'env Interner<'heap>,
    pointers: LocalVec<Option<Pointer<'heap>>, A>,
    targets: &'ctx DefIdSlice<Option<Target>>,
    changed: bool,
    lhs: Place<'heap>,
}

impl<'heap, A: Allocator> AdministrativeReductionVisitor<'_, '_, 'heap, A> {
    fn try_eval(&self, operand: Operand<'heap>) -> Option<Pointer<'heap>> {
        if let Operand::Place(place) = operand
            && place.projections.is_empty()
        {
            return self.pointers.lookup(place.local).copied();
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

impl<'heap, A: Allocator> VisitorMut<'heap> for AdministrativeReductionVisitor<'_, '_, 'heap, A> {
    type Filter = filter::Deep;
    type Residual = Result<Infallible, !>;
    type Result<T>
        = Result<T, !>
    where
        T: 'heap;

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

        // The target dictates how we reduce the closure, if it's closure forwarding, we simply
        // replace the closure (and add any prelude required) if it's a trivial thunk, we
        // simply inline, and replace the return with an assignment to our value.
        // Either way we add some locals, which are removed in subsequent passes.

        todo!()
    }
}
