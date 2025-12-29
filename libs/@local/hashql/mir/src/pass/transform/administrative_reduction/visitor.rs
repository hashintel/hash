use core::{convert::Infallible, mem};
use std::alloc::Allocator;

use hashql_core::{heap::Heap, id::IdVec};

use super::{Callee, Reducable, disjoint::DisjointIdSlice, kind::ReductionKind};
use crate::{
    body::{
        Body,
        basic_block::{BasicBlock, BasicBlockId},
        constant::Constant,
        local::{Local, LocalDecl, LocalVec},
        location::Location,
        operand::Operand,
        place::{FieldIndex, Place, ProjectionKind},
        rvalue::{Aggregate, AggregateKind, Apply, ArgVec, RValue},
        statement::{Assign, Statement, StatementKind},
        terminator::{Return, TerminatorKind},
    },
    def::DefId,
    intern::Interner,
    pass::transform::administrative_reduction::offset::OffsetLocalVisitor,
    visit::{self, VisitorMut, r#mut::filter},
};

struct Reduction<'heap> {
    callee: DefId,
    kind: ReductionKind,
    args: ArgVec<Operand<'heap>, &'heap Heap>,
}

pub(crate) struct BodyHeader<'heap> {
    pub id: DefId,
    pub local_decls: LocalVec<LocalDecl<'heap>, &'heap Heap>,
}

pub(crate) struct State<'heap> {
    pub changed: bool,
    lhs: Place<'heap>,
    reduction: Option<Reduction<'heap>>,
}

impl<'heap> State<'heap> {
    pub fn new() -> Self {
        Self {
            changed: false,
            lhs: Place::SYNTHETIC,
            reduction: None,
        }
    }
}

pub(crate) struct AdministrativeReductionVisitor<'body, 'env, 'heap, A: Allocator> {
    pub heap: &'heap Heap,
    pub interner: &'env Interner<'heap>,

    pub body: BodyHeader<'heap>,
    pub callees: LocalVec<Option<Callee<'heap>>, A>,

    pub bodies: DisjointIdSlice<'body, DefId, Body<'heap>>,
    pub reducable: &'env Reducable<A>,

    pub state: State<'heap>,
}

impl<'heap, A: Allocator> AdministrativeReductionVisitor<'_, '_, 'heap, A> {
    fn try_eval_callee(&self, operand: Operand<'heap>) -> Option<Callee<'heap>> {
        if let Operand::Constant(Constant::FnPtr(ptr)) = operand {
            return Some(Callee::Fn { ptr });
        }

        let Operand::Place(place) = operand else {
            return None;
        };

        let &pointer = self.callees.lookup(place.local)?;

        if place.projections.is_empty() {
            return Some(pointer);
        }

        // Degrade to a thin pointer if the projection is a field access to the first field
        if place.projections.len() == 1
            && place.projections[0].kind == ProjectionKind::Field(FieldIndex::FN_PTR)
            && let Callee::Closure { ptr, env: _ } = pointer
        {
            return Some(Callee::Fn { ptr });
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

        let &pointer = self.callees.lookup(place.local)?;

        match pointer {
            Callee::Fn { ptr } if place.projections.is_empty() => Some(ptr),
            Callee::Closure { ptr, env: _ }
                if place.projections.len() == 1
                    && place.projections[0].kind == ProjectionKind::Field(FieldIndex::FN_PTR) =>
            {
                Some(ptr)
            }
            _ => None,
        }
    }

    fn apply_reduction(
        &mut self,
        statements: &mut Vec<Statement<'heap>, &'heap Heap>,
        index: usize,
        Reduction {
            callee,
            kind: _,
            args,
        }: Reduction<'heap>,
    ) {
        let span = statements[index].span;

        let target = &self.bodies[callee];
        debug_assert_eq!(target.basic_blocks.len(), 1, "The target must be trivial");
        let target_bb = &target.basic_blocks[BasicBlockId::START];

        let TerminatorKind::Return(Return { mut value }) = target_bb.terminator.kind else {
            unreachable!("a thunk is only trivial if it has a return inside of a single bb");
        };

        // Add the locals that have been defined in the target function to our set, this may be more
        // than we need, subsequent passes are going to trim them.
        let local_offset = self.body.local_decls.len();
        self.body.local_decls.extend_from_slice(&target.local_decls);

        let mut offset = OffsetLocalVisitor::new(self.interner, local_offset);

        // Before we change the current statement, we must offset the operand, as otherwise we will
        // target the wrong local.
        // We know that the offset local visitor doesn't make use of the location, so we can simply
        // use the placeholder in it's invocation.
        offset.visit_operand(Location::PLACEHOLDER, &mut value);

        // Modify our statement to load the value from the local, this means that we'll have a
        // simple alias, which projection forwarding will resolve and subsequently remove inside
        // DSE.
        statements[index].kind = StatementKind::Assign(Assign {
            lhs: self.state.lhs,
            rhs: RValue::Load(value),
        });

        // We must now modify the body (via the statements) to include the new operations. There are
        // in total two things we must do:
        // 1. Assign the parameters their new values
        // 2. Include the body
        // Once done we add everything to the body
        let length = target_bb.statements.len() + target.args;
        debug_assert_eq!(args.len(), target.args);

        // We do not offset here, because offset happens at a later stage automatically, otherwise
        // we would double offset.
        let argument_statements = args
            .into_iter()
            .enumerate()
            .map(|(param, argument)| Statement {
                kind: StatementKind::Assign(Assign {
                    lhs: Place::local(Local::new(param), self.interner),
                    rhs: RValue::Load(argument),
                }),
                span,
            });
        statements.splice(
            index..index,
            argument_statements.chain(target_bb.statements.iter().cloned()),
        );

        // Once done we must now offset the statements, while doing so we must **not** include our
        // assignment statement (so no +1).
        for statement in &mut statements[index..(index + length)] {
            offset.visit_statement(Location::PLACEHOLDER, statement);
        }

        // Once done we have successfully soft inlined everything
    }
}

impl<'heap, A: Allocator> VisitorMut<'heap> for AdministrativeReductionVisitor<'_, '_, 'heap, A> {
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
        self.state.lhs = assign.lhs;
        debug_assert!(
            self.state.lhs.projections.is_empty(),
            "MIR must be in SSA form"
        );

        visit::r#mut::walk_statement_assign(self, location, assign)
    }

    fn visit_rvalue(&mut self, location: Location, rvalue: &mut RValue<'heap>) -> Self::Result<()> {
        if let &mut RValue::Load(load) = rvalue
            && let Some(ptr) = self.try_eval_ptr(load)
        {
            self.callees
                .insert(self.state.lhs.local, Callee::Fn { ptr });
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

        self.callees
            .insert(self.state.lhs.local, Callee::Closure { ptr, env });

        Ok(())
    }

    fn visit_rvalue_apply(&mut self, _: Location, apply: &mut Apply<'heap>) -> Self::Result<()> {
        // Closure devirt, there are two cases which we can resolve:
        // Nothing to do here, this is because we *must* look at a closure here.
        let Some(ptr) = self.try_eval_ptr(apply.function) else {
            return Ok(());
        };

        if ptr == self.body.id {
            // We can't reduce a closure to itself, so we just return Ok(())
            return Ok(());
        }

        // We now know the closure, we now must check if it is an eligible target for administrative
        // reduction
        let Some(kind) = self.reducable.get(ptr) else {
            return Ok(());
        };

        let args = mem::replace(&mut apply.arguments, IdVec::new_in(self.heap));

        // The target dictates how we reduce the closure, if it's closure forwarding, we simply
        // replace the closure (and add any prelude required) if it's a trivial thunk, we
        // simply inline, and replace the return with an assignment to our value.
        // Either way we add some locals, which are removed in subsequent passes.
        self.state.reduction = Some(Reduction {
            callee: ptr,
            kind,
            args,
        });

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
            if let Some(reduction) = self.state.reduction.take() {
                self.state.changed = true;
                self.apply_reduction(statements, location.statement_index - 1, reduction);

                // We must *wind back* the clock the previous statement, as we have added new
                // statements. This allows us to skip fix-point iteration.
                location.statement_index -= 1;
            }
        }

        self.visit_terminator(location, terminator)?;

        Ok(())
    }
}
