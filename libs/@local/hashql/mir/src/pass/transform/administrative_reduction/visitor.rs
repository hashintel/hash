//! MIR visitor for performing administrative reductions within a single body.
//!
//! This module contains the [`AdministrativeReductionVisitor`] which walks through statements,
//! tracks closure/function pointer assignments, and performs inlining when it encounters calls
//! to reducible functions.

use core::{alloc::Allocator, convert::Infallible, mem};

use hashql_core::{
    heap::Heap,
    id::{Id as _, IdVec},
};

use super::{Reducable, disjoint::DisjointIdSlice};
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

/// A pending reduction to be applied after visiting a call statement.
///
/// When the visitor encounters a reducible call, it doesn't inline immediately (to avoid
/// invalidating the current iteration state). Instead, it records the reduction here and
/// applies it after `visit_statement` returns.
struct Reduction<'heap> {
    callee: DefId,
    args: ArgVec<Operand<'heap>, &'heap Heap>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum ClosureEnv<'heap> {
    Place(Place<'heap>),
    Unit,
}

impl<'heap> ClosureEnv<'heap> {
    const fn from_operand(operand: Operand<'heap>) -> Option<Self> {
        match operand {
            Operand::Place(place) => Some(ClosureEnv::Place(place)),
            Operand::Constant(Constant::Unit) => Some(ClosureEnv::Unit),
            Operand::Constant(_) => None,
        }
    }
}

/// Represents a known function or closure value assigned to a local.
///
/// The visitor tracks these assignments to resolve indirect calls (calls through locals)
/// to their concrete callees, enabling reduction of closures passed as values.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum Callee<'heap> {
    /// A bare function pointer.
    Fn { ptr: DefId },
    /// A closure: function pointer plus captured environment.
    Closure { ptr: DefId, env: ClosureEnv<'heap> },
}

/// Header information for the body being transformed.
///
/// This is separated from the main body to allow the visitor to extend `local_decls`
/// with locals from inlined callees while the body's basic blocks are being visited.
pub(crate) struct BodyHeader<'heap> {
    pub id: DefId,
    pub local_decls: LocalVec<LocalDecl<'heap>, &'heap Heap>,
}

/// Mutable state carried through the visitor traversal.
pub(crate) struct State<'heap> {
    /// Whether any reductions were performed.
    pub changed: bool,
    /// The LHS of the current assignment being visited (used to record closure tracking).
    lhs: Place<'heap>,
    /// A pending reduction to apply after the current statement.
    reduction: Option<Reduction<'heap>>,
}

impl State<'_> {
    pub(crate) const fn new() -> Self {
        Self {
            changed: false,
            lhs: Place::SYNTHETIC,
            reduction: None,
        }
    }
}

/// The MIR visitor that performs administrative reduction within a single body.
///
/// This visitor:
/// 1. Tracks assignments of function pointers and closures to locals
/// 2. When encountering a call (`Apply`), checks if the callee is reducible
/// 3. If reducible, inlines the callee's body at the call site
///
/// The visitor implements local fixpoint iteration by rewinding the statement index after
/// each reduction, ensuring that newly inserted statements are also processed.
pub(crate) struct AdministrativeReductionVisitor<'ctx, 'env, 'heap, A: Allocator> {
    pub heap: &'heap Heap,
    pub interner: &'env Interner<'heap>,

    pub body: BodyHeader<'heap>,
    /// Maps locals to their known callee values (for resolving indirect calls).
    pub callees: &'ctx mut LocalVec<Option<Callee<'heap>>, A>,

    /// Read-only access to all bodies except the one being transformed.
    pub bodies: DisjointIdSlice<'ctx, DefId, Body<'heap>>,
    pub reducable: &'env Reducable<A>,

    pub state: State<'heap>,
}

impl<'heap, A: Allocator> AdministrativeReductionVisitor<'_, '_, 'heap, A> {
    /// Attempts to resolve an operand to a known callee (function or closure).
    ///
    /// This handles:
    /// - Direct function pointer constants
    /// - Locals known to hold function pointers or closures
    /// - Field projections extracting the function pointer from a closure
    pub(super) fn try_eval_callee(&self, operand: Operand<'heap>) -> Option<Callee<'heap>> {
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

        // Extracting the function pointer field from a closure degrades it to a bare Fn.
        if place.projections.len() == 1
            && place.projections[0].kind == ProjectionKind::Field(FieldIndex::FN_PTR)
            && let Callee::Closure { ptr, env: _ } = pointer
        {
            return Some(Callee::Fn { ptr });
        }

        None
    }

    /// Attempts to resolve an operand to a concrete function `DefId`.
    ///
    /// Unlike [`try_eval_callee`](Self::try_eval_callee), this only returns the function pointer,
    /// not the full closure information. Used when we only need to know *which* function is
    /// being called, not how it's packaged.
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
            Callee::Fn { .. } | Callee::Closure { .. } => None,
        }
    }

    /// Inlines a reducible callee at the given call site.
    ///
    /// This is the core inlining operation. Given a call `lhs = Apply(callee, args)` at
    /// `statements[index]`, it transforms the code to:
    ///
    /// ```text
    /// // Parameter bindings (caller args -> callee params)
    /// param0 = arg0
    /// param1 = arg1
    /// ...
    /// // Callee body statements (with locals offset)
    /// <callee statements>
    /// // Original call site becomes a load of the return value
    /// lhs = <callee return value>
    /// ```
    fn apply_reduction(
        &mut self,
        statements: &mut Vec<Statement<'heap>, &'heap Heap>,
        index: usize,
        Reduction { callee, args }: Reduction<'heap>,
    ) {
        let span = statements[index].span;

        let target = &self.bodies[callee];
        debug_assert_eq!(target.basic_blocks.len(), 1, "The target must be trivial");
        let target_bb = &target.basic_blocks[BasicBlockId::START];

        let TerminatorKind::Return(Return { mut value }) = target_bb.terminator.kind else {
            unreachable!("a thunk is only trivial if it has a return inside of a single bb");
        };

        // Append callee's locals to our local_decls. Subsequent passes (DCE) will trim unused ones.
        let local_offset = self.body.local_decls.len();
        self.body.local_decls.extend_from_slice(&target.local_decls);

        let mut offset = OffsetLocalVisitor::new(self.interner, local_offset);

        // Offset the return value operand to reference the new local positions.
        offset.visit_operand(Location::PLACEHOLDER, &mut value);

        // Rewrite the call statement to load from the (now offset) return value.
        // This creates an alias that projection forwarding and DCE will clean up.
        statements[index].kind = StatementKind::Assign(Assign {
            lhs: self.state.lhs,
            rhs: RValue::Load(value),
        });

        let length = target_bb.statements.len() + target.args;
        debug_assert_eq!(args.len(), target.args);

        // Build parameter binding statements. LHS is pre-offset (callee param locals), RHS is
        // NOT offset (caller argument operands). This is critical for correctness.
        let argument_statements = args
            .into_iter()
            .enumerate()
            .map(|(param, argument)| Statement {
                kind: StatementKind::Assign(Assign {
                    lhs: Place::local(Local::from_usize(local_offset + param)),
                    rhs: RValue::Load(argument),
                }),
                span,
            });

        // Insert: [param bindings] + [callee body] before the rewritten call statement.
        statements.splice(
            index..index,
            argument_statements.chain(target_bb.statements.iter().cloned()),
        );

        // Offset only the callee body statements, NOT the parameter bindings (which already
        // have correct LHS indices and must preserve caller locals in RHS).
        // Range: [index + target.args .. index + length) = callee body only
        for statement in &mut statements[(index + target.args)..(index + length)] {
            offset.visit_statement(Location::PLACEHOLDER, statement);
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

    /// Track function pointer loads: `local = Load(fn_ptr)` → record local as known callee.
    fn visit_rvalue(&mut self, location: Location, rvalue: &mut RValue<'heap>) -> Self::Result<()> {
        if let &mut RValue::Load(load) = rvalue
            && let Some(callee) = self.try_eval_callee(load)
        {
            self.callees.insert(self.state.lhs.local, callee);
        }

        visit::r#mut::walk_rvalue(self, location, rvalue)
    }

    /// Track closure construction: `local = Aggregate(Closure, [fn_ptr, env])` → record as closure.
    fn visit_rvalue_aggregate(
        &mut self,
        _: Location,
        aggregate: &mut Aggregate<'heap>,
    ) -> Self::Result<()> {
        if aggregate.kind != AggregateKind::Closure {
            return Ok(());
        }

        let &[Operand::Constant(Constant::FnPtr(ptr)), env] = &aggregate.operands[..] else {
            unreachable!(
                "Closure must have exactly two operands, with the first being a function pointer \
                 and the second being a place to the environment."
            )
        };

        let Some(env) = ClosureEnv::from_operand(env) else {
            unreachable!(
                "Closure must have exactly two operands, with the first being a function pointer \
                 and the second being a place to the environment."
            );
        };

        self.callees
            .insert(self.state.lhs.local, Callee::Closure { ptr, env });

        Ok(())
    }

    /// Check if a call can be reduced and queue the reduction if so.
    ///
    /// This doesn't perform the reduction immediately — it records it in `state.reduction`
    /// to be applied after `visit_statement` returns.
    fn visit_rvalue_apply(&mut self, _: Location, apply: &mut Apply<'heap>) -> Self::Result<()> {
        let Some(ptr) = self.try_eval_ptr(apply.function) else {
            return Ok(());
        };

        // Guard against self-recursion: inlining ourselves would loop forever.
        if ptr == self.body.id {
            return Ok(());
        }

        if self.reducable.get(ptr).is_none() {
            return Ok(());
        }

        let args = mem::replace(&mut apply.arguments, IdVec::new_in(self.heap));

        // Queue the reduction. The actual inlining happens in `visit_basic_block` after
        // this method returns.
        self.state.reduction = Some(Reduction { callee: ptr, args });

        Ok(())
    }

    /// Custom basic block visitor that implements local fixpoint iteration.
    ///
    /// After each reduction, we decrement `statement_index` to re-visit the newly inserted
    /// statements. This ensures nested reductions (e.g., a thunk calling another thunk) are
    /// fully applied without needing a separate fixpoint loop.
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

        self.visit_basic_block_params(location, params)?;

        while location.statement_index < statements.len() {
            let statement = &mut statements[location.statement_index];
            location.statement_index += 1;

            self.visit_statement(location, statement)?;
            if let Some(reduction) = self.state.reduction.take() {
                self.state.changed = true;
                self.apply_reduction(statements, location.statement_index - 1, reduction);

                // Rewind to re-process newly inserted statements. The `apply_reduction` call
                // inserted statements *before* the current index, so decrementing lets us
                // visit them on the next loop iteration.
                location.statement_index -= 1;
            }
        }

        self.visit_terminator(location, terminator)?;

        Ok(())
    }
}
