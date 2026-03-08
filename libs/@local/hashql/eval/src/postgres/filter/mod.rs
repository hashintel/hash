//! CFG-to-SQL lowering for graph read filter bodies.
//!
//! A [`GraphReadFilterCompiler`] compiles the Postgres-placed portion of a filter body (an
//! [`IslandNode`]) into a single SQL [`Expression`]. The expression is a `CASE` tree that
//! evaluates MIR control flow and produces a `continuation` composite value.
//!
//! ## Strategy
//!
//! - Statements are compiled in execution order, tracking each MIR local as a SQL expression.
//! - Control flow is compiled using an explicit stack of [`Frame`]s rather than recursion.
//! - [`SwitchInt`] becomes `CASE WHEN ... THEN ... ELSE ... END` via [`finish_switch_int`].
//! - When control leaves the current Postgres island, compilation emits an "island exit"
//!   continuation that transfers live-out locals back to the interpreter.
//!
//! Unsupported constructs (closures, nested graph reads, etc.) emit diagnostics and lower to
//! `NULL` placeholders so compilation can continue and report multiple issues.
//!
//! [`SwitchInt`]: hashql_mir::body::terminator::SwitchInt

#[cfg(test)]
mod tests;

use alloc::alloc::Global;
use core::alloc::Allocator;

use hash_graph_postgres_store::store::postgres::query::{
    self, BinaryExpression, BinaryOperator, Expression, PostgresType, UnaryExpression,
    UnaryOperator,
};
use hashql_core::{
    graph::Predecessors as _,
    id::{
        Id as _, IdSnapshotVec,
        snapshot_vec::{AppendOnly, Snapshot},
    },
    span::SpanId,
};
use hashql_diagnostics::DiagnosticIssues;
use hashql_hir::node::operation::{InputOp, UnOp};
use hashql_mir::{
    body::{
        Body,
        basic_block::{BasicBlock, BasicBlockId},
        constant::Constant,
        local::{Local, LocalSnapshotVec},
        operand::Operand,
        place::{FieldIndex, Place, Projection, ProjectionKind},
        rvalue::{Aggregate, AggregateKind, Apply, BinOp, Binary, Input, RValue, Unary},
        statement::{Assign, Statement, StatementKind},
        terminator::{Goto, Return, SwitchInt, SwitchTargets, Target, TerminatorKind},
    },
    pass::execution::{IslandNode, TargetId, VertexType, traversal::EntityPath},
};

use super::{
    DatabaseContext,
    error::{
        closure_aggregate, closure_application, entity_path_resolution, function_pointer_constant,
        graph_read_terminator, invalid_env_access, invalid_env_projection, projected_assignment,
        unsupported_vertex_type,
    },
    traverse::eval_entity_path,
};
use crate::{context::EvalContext, error::EvalDiagnosticIssues};

/// Internal representation of a continuation result before casting to the SQL composite type.
///
/// This mirrors the runtime continuation contract:
/// - [`Return`]: produces a filter decision for the current row.
/// - [`IslandExit`]: transfers control back to the interpreter with a next-block id and live
///   locals.
/// - [`Null`]: produces an all-`NULL` continuation used after unrecoverable lowering errors.
///
/// [`Return`]: Self::Return
/// [`IslandExit`]: Self::IslandExit
/// [`Null`]: Self::Null
enum Continuation {
    /// The filter body returned a boolean filter decision.
    Return { filter: Expression },
    /// Control flow left the current island, transferring live locals to the interpreter.
    IslandExit {
        block: BasicBlockId,
        locals: Vec<Expression>,
        values: Vec<Expression>,
    },
    /// Error sentinel; all fields are `NULL`.
    Null,
}

impl From<Continuation> for Expression {
    fn from(continuation: Continuation) -> Self {
        let null = Self::Constant(query::Constant::Null);

        // Row fields must match the `continuation` composite type:
        // (filter, block, locals, values)
        let row = match continuation {
            Continuation::Return { filter } => {
                vec![
                    filter.grouped().cast(PostgresType::Boolean),
                    null.clone(),
                    null.clone(),
                    null,
                ]
            }
            Continuation::IslandExit {
                block,
                locals,
                values,
            } => {
                vec![
                    null,
                    Self::Constant(query::Constant::U32(block.as_u32())),
                    Self::Function(query::Function::ArrayLiteral {
                        elements: locals,
                        element_type: PostgresType::Int,
                    }),
                    Self::Function(query::Function::ArrayLiteral {
                        elements: values,
                        element_type: PostgresType::JsonB,
                    }),
                ]
            }
            Continuation::Null => {
                vec![null.clone(), null.clone(), null.clone(), null]
            }
        };

        Self::Row(row).cast(PostgresType::Continuation)
    }
}

/// Stack frame for the iterative CFG-to-SQL compiler.
///
/// The compiler walks basic blocks using an explicit stack instead of recursion. Frames represent
/// pending work items:
///
/// - [`Compile`]: compile the block at the given id.
/// - [`Enter`]: snapshot locals, assign block parameters, then compile the target block.
/// - [`Rollback`]: restore the local-expression map after a branch has been compiled.
/// - [`FinishSwitchInt`]: assemble a `CASE` expression from the already-compiled branch results.
///
/// [`Compile`]: Self::Compile
/// [`Enter`]: Self::Enter
/// [`Rollback`]: Self::Rollback
/// [`FinishSwitchInt`]: Self::FinishSwitchInt
enum Frame<'ctx, 'heap> {
    Compile(BasicBlockId),
    Enter {
        from: BasicBlockId,
        to: Target<'heap>,
    },
    Rollback(Snapshot),
    FinishSwitchInt {
        discriminant: Box<Expression>,
        targets: &'ctx SwitchTargets<'heap>,
    },
}

/// Assembles a `CASE` expression from the completed branches of a `SwitchInt`.
///
/// Branch results are expected on `results` in the same order as `targets.values()`, with an
/// optional "otherwise" result on top. This function drains those results and pushes a single
/// [`Expression::CaseWhen`] back onto `results`.
fn finish_switch_int<A: Allocator>(
    results: &mut Vec<Expression, A>,
    discriminant: Expression,
    targets: &SwitchTargets<'_>,
) {
    let else_result = targets
        .has_otherwise()
        .then(|| Box::new(results.pop().unwrap_or_else(|| unreachable!())));

    // Branch results were pushed in forward order (first target first), so
    // draining the tail gives them in the same order as `targets.values()`.
    let start = results.len() - targets.values().len();
    let branch_results = results.drain(start..);

    debug_assert_eq!(branch_results.len(), targets.values().len());

    // SwitchInt compares the discriminant against integer values. If the
    // discriminant is a boolean expression (e.g. `IS NOT NULL`), PostgreSQL
    // rejects `boolean = integer`. Casting to `::int` is safe for all types
    // and a no-op when the discriminant is already integral.
    let discriminant = Box::new(discriminant.grouped().cast(PostgresType::Int));

    let mut discriminant = Some(discriminant);
    let mut conditions = Vec::with_capacity(targets.values().len());

    for (index, (&value, then)) in targets.values().iter().zip(branch_results).enumerate() {
        let is_last = index == targets.values().len() - 1;
        let discriminant = if is_last {
            discriminant.take().unwrap_or_else(|| unreachable!())
        } else {
            discriminant.clone().unwrap_or_else(|| unreachable!())
        };

        let when = Expression::Binary(BinaryExpression {
            op: BinaryOperator::Equal,
            left: discriminant,
            right: Box::new(Expression::Constant(query::Constant::U128(value))),
        });

        conditions.push((when, then));
    }

    results.push(Expression::CaseWhen {
        conditions,
        else_result,
    });
}

/// Compiles a Postgres island of a graph-read filter body into a `continuation` expression.
///
/// The compiler maintains a mapping from MIR locals to SQL expressions, supports
/// snapshot/rollback across branching control flow, and accumulates diagnostics into an
/// internal buffer retrievable via [`Self::into_diagnostics`].
pub(crate) struct GraphReadFilterCompiler<'ctx, 'heap, A: Allocator = Global, S: Allocator = Global>
{
    context: &'ctx EvalContext<'ctx, 'heap, A>,

    body: &'ctx Body<'heap>,
    /// MIR local → SQL expression mapping, with snapshot/rollback for branching.
    locals: LocalSnapshotVec<Option<Expression>, AppendOnly, S>,
    diagnostics: EvalDiagnosticIssues,

    scratch: S,
}

impl<'ctx, 'heap, A: Allocator, S: Allocator> GraphReadFilterCompiler<'ctx, 'heap, A, S> {
    pub(crate) fn new(
        context: &'ctx EvalContext<'ctx, 'heap, A>,
        body: &'ctx Body<'heap>,
        scratch: S,
    ) -> Self
    where
        S: Clone,
    {
        Self {
            context,
            body,
            locals: IdSnapshotVec::new_in(scratch.clone()),
            diagnostics: DiagnosticIssues::new(),
            scratch,
        }
    }

    pub(crate) fn into_diagnostics(self) -> EvalDiagnosticIssues {
        self.diagnostics
    }

    fn compile_place_vertex<'place>(
        &mut self,
        db: &mut DatabaseContext<'heap, A>,
        span: SpanId,
        place: &'place Place<'heap>,
    ) -> (Expression, &'place [Projection<'heap>]) {
        let Some(r#type) =
            VertexType::from_local(self.context.env, &self.body.local_decls[Local::VERTEX])
        else {
            self.diagnostics.push(unsupported_vertex_type(span));
            return (Expression::Constant(query::Constant::Null), &[]);
        };

        match r#type {
            VertexType::Entity => {
                let Some((path, consumed)) = EntityPath::resolve(&place.projections) else {
                    self.diagnostics.push(entity_path_resolution(span));
                    return (Expression::Constant(query::Constant::Null), &[]);
                };

                let base = eval_entity_path(db, path);

                (base, &place.projections[consumed..])
            }
        }
    }

    /// Only field projections are supported on the environment; other projection kinds emit
    /// diagnostics.
    fn compile_place_env<'place>(
        &mut self,
        db: &mut DatabaseContext<'heap, A>,
        span: SpanId,
        place: &'place Place<'heap>,
    ) -> (Expression, &'place [Projection<'heap>]) {
        match &*place.projections {
            [] => {
                self.diagnostics.push(invalid_env_access(span));
                (Expression::Constant(query::Constant::Null), &[])
            }
            [
                Projection {
                    r#type: _,
                    kind: ProjectionKind::Field(field),
                },
                rest @ ..,
            ] => {
                let param = db.parameters.env(self.body.id, *field);
                (param.into(), rest)
            }
            [..] => {
                self.diagnostics.push(invalid_env_projection(span));
                (Expression::Constant(query::Constant::Null), &[])
            }
        }
    }

    fn compile_place(
        &mut self,
        db: &mut DatabaseContext<'heap, A>,
        span: SpanId,
        place: &Place<'heap>,
    ) -> Expression {
        let (mut expression, projections) = match place.local {
            Local::ENV => self.compile_place_env(db, span, place),
            Local::VERTEX => self.compile_place_vertex(db, span, place),
            _ => (
                self.locals
                    .lookup(place.local)
                    .cloned()
                    .unwrap_or_else(|| unreachable!("use before def")),
                &*place.projections,
            ),
        };

        if !projections.is_empty() {
            let mut arguments = Vec::with_capacity(projections.len() + 1);
            arguments.push(expression);

            for projection in projections {
                let index = match &projection.kind {
                    // TODO: in the future if we desugar struct FieldByName to FieldByIndex we need
                    // to convert back here
                    ProjectionKind::Field(field_index) => {
                        Expression::Constant(query::Constant::U32(field_index.as_u32()))
                    }
                    &ProjectionKind::FieldByName(symbol) => db.parameters.symbol(symbol).into(),
                    &ProjectionKind::Index(local) => self
                        .locals
                        .lookup(local)
                        .unwrap_or_else(|| unreachable!("use before def"))
                        .clone(),
                };

                // `json_extract_path` takes text arguments, so all indices (including
                // numeric field indices) must be cast to text.
                arguments.push(index.grouped().cast(PostgresType::Text));
            }

            expression = Expression::Function(query::Function::JsonExtractPath(arguments));
        }

        expression
    }

    fn compile_constant(
        &mut self,
        db: &mut DatabaseContext<'heap, A>,
        span: SpanId,
        constant: &Constant<'heap>,
    ) -> Expression {
        match constant {
            Constant::Int(int) if let Some(uint) = int.as_u32() => {
                Expression::Constant(query::Constant::U32(uint))
            }
            &Constant::Int(int) => db.parameters.int(int).into(),
            &Constant::Primitive(primitive) => db.parameters.primitive(primitive).into(),
            // Unit is the zero-sized type, represented as JSON `null` inside jsonb values.
            Constant::Unit => Expression::Constant(query::Constant::JsonNull),
            Constant::FnPtr(_) => {
                self.diagnostics.push(function_pointer_constant(span));
                Expression::Constant(query::Constant::Null)
            }
        }
    }

    fn compile_operand(
        &mut self,
        db: &mut DatabaseContext<'heap, A>,
        span: SpanId,
        operand: &Operand<'heap>,
    ) -> Expression {
        match operand {
            Operand::Place(place) => self.compile_place(db, span, place),
            Operand::Constant(constant) => self.compile_constant(db, span, constant),
        }
    }

    fn compile_unary(
        &mut self,
        db: &mut DatabaseContext<'heap, A>,
        span: SpanId,
        Unary { op, operand }: &Unary<'heap>,
    ) -> Expression {
        let operand = self.compile_operand(db, span, operand);

        let op = match *op {
            UnOp::Not => UnaryOperator::Not,
            UnOp::BitNot => UnaryOperator::BitwiseNot,
            UnOp::Neg => UnaryOperator::Negate,
        };

        Expression::Unary(UnaryExpression {
            op,
            expr: Box::new(operand),
        })
    }

    fn compile_binary(
        &mut self,
        db: &mut DatabaseContext<'heap, A>,
        span: SpanId,
        Binary { op, left, right }: &Binary<'heap>,
    ) -> Expression {
        let mut left = self.compile_operand(db, span, left);
        let mut right = self.compile_operand(db, span, right);

        // Operands coming from jsonb extraction are untyped from Postgres' perspective.
        // Arithmetic and bitwise operators need explicit casts; comparisons work on jsonb
        // directly.
        let (op, cast) = match *op {
            BinOp::Add => (BinaryOperator::Add, Some(PostgresType::Numeric)),
            BinOp::Sub => (BinaryOperator::Subtract, Some(PostgresType::Numeric)),
            BinOp::BitAnd => (BinaryOperator::BitwiseAnd, Some(PostgresType::BigInt)),
            BinOp::BitOr => (BinaryOperator::BitwiseOr, Some(PostgresType::BigInt)),
            BinOp::Eq => (BinaryOperator::Equal, None),
            BinOp::Ne => (BinaryOperator::NotEqual, None),
            BinOp::Lt => (BinaryOperator::Less, None),
            BinOp::Lte => (BinaryOperator::LessOrEqual, None),
            BinOp::Gt => (BinaryOperator::Greater, None),
            BinOp::Gte => (BinaryOperator::GreaterOrEqual, None),
        };

        if let Some(target) = cast {
            left = left.grouped().cast(target.clone());
            right = right.grouped().cast(target);
        }

        Expression::Binary(BinaryExpression {
            op,
            left: Box::new(left),
            right: Box::new(right),
        })
    }

    fn compile_input(
        db: &mut DatabaseContext<'heap, A>,
        Input { op, name }: &Input<'heap>,
    ) -> Expression {
        let index = db.parameters.input(*name);

        match *op {
            InputOp::Load { required: _ } => index.into(),
            InputOp::Exists => Expression::Unary(UnaryExpression {
                op: UnaryOperator::Not,
                expr: Box::new(Expression::Unary(UnaryExpression {
                    op: UnaryOperator::IsNull,
                    expr: Box::new(index.into()),
                })),
            }),
        }
    }

    fn compile_aggregate(
        &mut self,
        db: &mut DatabaseContext<'heap, A>,
        span: SpanId,
        Aggregate { kind, operands }: &Aggregate<'heap>,
    ) -> Expression {
        match kind {
            AggregateKind::Tuple => {
                let mut expressions = Vec::with_capacity(operands.len());

                for operand in operands {
                    expressions.push(self.compile_operand(db, span, operand));
                }

                // Values are reconstructed to their corresponding tuple and struct definitions
                // using type-directed deserialization.
                Expression::Function(query::Function::JsonBuildArray(expressions))
            }
            AggregateKind::Struct { fields } => {
                debug_assert_eq!(fields.len(), operands.len());

                let mut expressions = Vec::with_capacity(fields.len());

                for (&key, value) in fields.iter().zip(operands) {
                    let key = db.parameters.symbol(key);
                    let value = self.compile_operand(db, span, value);

                    expressions.push((key.into(), value));
                }

                // Values are reconstructed to their corresponding tuple and struct definitions
                // using type-directed deserialization.
                Expression::Function(query::Function::JsonBuildObject(expressions))
            }
            AggregateKind::List => {
                let mut expressions = Vec::with_capacity(operands.len());

                for operand in operands {
                    expressions.push(self.compile_operand(db, span, operand));
                }

                Expression::Function(query::Function::JsonBuildArray(expressions))
            }
            #[expect(clippy::integer_division_remainder_used, clippy::integer_division)]
            AggregateKind::Dict => {
                debug_assert_eq!(operands.len() % 2, 0);

                let mut expressions = Vec::with_capacity(operands.len() / 2);

                for [key, value] in operands.iter().array_chunks() {
                    expressions.push((
                        self.compile_operand(db, span, key),
                        self.compile_operand(db, span, value),
                    ));
                }

                Expression::Function(query::Function::JsonBuildObject(expressions))
            }
            AggregateKind::Opaque(_) => {
                debug_assert_eq!(operands.len(), 1);

                self.compile_operand(db, span, &operands[FieldIndex::OPAQUE_VALUE])
            }
            AggregateKind::Closure => {
                self.diagnostics.push(closure_aggregate(span));
                Expression::Constant(query::Constant::Null)
            }
        }
    }

    fn compile_apply(&mut self, span: SpanId, _: &Apply<'heap>) -> Expression {
        self.diagnostics.push(closure_application(span));
        Expression::Constant(query::Constant::Null)
    }

    fn compile_rvalue(
        &mut self,
        db: &mut DatabaseContext<'heap, A>,
        span: SpanId,
        rvalue: &RValue<'heap>,
    ) -> Expression {
        match rvalue {
            RValue::Load(operand) => self.compile_operand(db, span, operand),
            RValue::Binary(binary) => self.compile_binary(db, span, binary),
            RValue::Unary(unary) => self.compile_unary(db, span, unary),
            RValue::Aggregate(aggregate) => self.compile_aggregate(db, span, aggregate),
            RValue::Input(input) => Self::compile_input(db, input),
            RValue::Apply(apply) => self.compile_apply(span, apply),
        }
    }

    fn compile_statement(
        &mut self,
        db: &mut DatabaseContext<'heap, A>,
        statement: &Statement<'heap>,
    ) {
        let Assign { lhs, rhs } = match &statement.kind {
            StatementKind::Assign(assign) => assign,
            StatementKind::Nop | StatementKind::StorageLive(_) | StatementKind::StorageDead(_) => {
                return;
            }
        };

        if !lhs.projections.is_empty() {
            self.diagnostics.push(projected_assignment(statement.span));
            return;
        }

        let rvalue = self.compile_rvalue(db, statement.span, rhs);
        self.locals.insert(lhs.local, rvalue);
    }

    fn assign_params(
        &mut self,
        db: &mut DatabaseContext<'heap, A>,
        span: SpanId,
        target: &Target<'heap>,
    ) -> &'ctx BasicBlock<'heap> {
        let target_block = &self.body.basic_blocks[target.block];
        debug_assert_eq!(target_block.params.len(), target.args.len());

        for (&param, arg) in target_block.params.iter().zip(target.args.iter()) {
            let expression = self.compile_operand(db, span, arg);
            self.locals.insert(param, expression);
        }

        target_block
    }

    fn find_entry_block(&self, island: &IslandNode) -> BasicBlockId {
        for block in island.members() {
            if self
                .body
                .basic_blocks
                .predecessors(block)
                .all(|pred| !island.contains(pred))
            {
                return block;
            }
        }

        unreachable!("The postgres island always has an entry block (BasicBlockId::START)")
    }

    fn compile_island_exit(
        &mut self,
        db: &mut DatabaseContext<'heap, A>,
        span: SpanId,
        current: BasicBlockId,
        target: &Target<'heap>,
    ) -> Expression {
        // Re-acquire live-out information because `compile_operand` borrows `self` mutably.
        let live_out = &self.context.live_out[(self.body.id, current)];

        let mut locals = Vec::with_capacity(target.args.len() + live_out.count());
        let mut values = Vec::with_capacity(target.args.len() + live_out.count());

        // Block parameters from the jump target come first, then all remaining live-out
        // locals. The interpreter zips locals[i] with values[i] to restore each binding.
        let target_block = &self.body.basic_blocks[target.block];
        debug_assert_eq!(target_block.params.len(), target.args.len());

        for (&param, arg) in target_block.params.iter().zip(target.args) {
            let value = self.compile_operand(db, span, arg);

            locals.push(Expression::Constant(query::Constant::U32(param.as_u32())));
            values.push(value);
        }

        for local in live_out {
            let value = self
                .locals
                .lookup(local)
                .unwrap_or_else(|| unreachable!("use before def"))
                .clone();

            locals.push(Expression::Constant(query::Constant::U32(local.as_u32())));
            values.push(value);
        }

        Continuation::IslandExit {
            block: target.block,
            locals,
            values,
        }
        .into()
    }

    fn compile_blocks(
        &mut self,
        db: &mut DatabaseContext<'heap, A>,
        stack: &mut Vec<Frame<'ctx, 'heap>, S>,
        results: &mut Vec<Expression, S>,
        start: BasicBlockId,
        island: &IslandNode,
    ) {
        let mut block_id = start;

        // Follow GOTOs directly instead of going through the stack, skipping superfluous
        // snapshot and rollback frames.
        loop {
            let block = &self.body.basic_blocks[block_id];

            for statement in &block.statements {
                self.compile_statement(db, statement);
            }

            let terminator_span = block.terminator.span;

            match &block.terminator.kind {
                TerminatorKind::Goto(Goto { target }) => {
                    if !island.contains(target.block) {
                        let exit = self.compile_island_exit(db, terminator_span, block_id, target);
                        results.push(exit);

                        break;
                    }

                    self.assign_params(db, terminator_span, target);
                    block_id = target.block;
                }
                TerminatorKind::SwitchInt(SwitchInt {
                    discriminant,
                    targets,
                }) => {
                    let discriminant = self.compile_operand(db, terminator_span, discriminant);

                    stack.push(Frame::FinishSwitchInt {
                        discriminant: Box::new(discriminant),
                        targets,
                    });

                    // Targets are pushed in reverse so that the first target is on top
                    // and gets processed first. This ensures results land on the result
                    // stack in the same order as `targets.values()`.
                    if let Some(otherwise) = targets.otherwise() {
                        stack.push(Frame::Enter {
                            from: block_id,
                            to: otherwise,
                        });
                    }

                    for (_, target) in targets.iter().rev() {
                        stack.push(Frame::Enter {
                            from: block_id,
                            to: target,
                        });
                    }

                    break;
                }
                TerminatorKind::Return(Return { value }) => {
                    let filter = self.compile_operand(db, terminator_span, value);
                    results.push(Continuation::Return { filter }.into());

                    break;
                }
                TerminatorKind::GraphRead(_) => {
                    self.diagnostics
                        .push(graph_read_terminator(block.terminator.span));
                    results.push(Continuation::Null.into());
                    break;
                }
                TerminatorKind::Unreachable => unreachable!(),
            }
        }
    }

    pub(crate) fn compile_body(
        &mut self,
        db: &mut DatabaseContext<'heap, A>,
        island: &IslandNode,
    ) -> Expression
    where
        S: Clone,
    {
        debug_assert_eq!(island.target(), TargetId::Postgres);

        let mut stack = Vec::new_in(self.scratch.clone());
        stack.push(Frame::Compile(self.find_entry_block(island)));

        let mut results = Vec::new_in(self.scratch.clone());

        while let Some(frame) = stack.pop() {
            match frame {
                Frame::Compile(start) => {
                    self.compile_blocks(db, &mut stack, &mut results, start, island);
                }

                Frame::Enter { from, to: target } => {
                    let span = self.body.basic_blocks[from].terminator.span;

                    // Target may be outside the island (e.g. an otherwise-branch
                    // of a SwitchInt that jumps back to the interpreter).
                    if !island.contains(target.block) {
                        let exit = self.compile_island_exit(db, span, from, &target);

                        results.push(exit);
                        continue;
                    }

                    let snapshot = self.locals.snapshot();

                    self.assign_params(db, span, &target);

                    // Rollback is pushed first so it runs after the block completes
                    // (LIFO), restoring locals for the next sibling branch.
                    stack.push(Frame::Rollback(snapshot));
                    stack.push(Frame::Compile(target.block));
                }

                Frame::Rollback(snapshot) => {
                    self.locals.rollback_to(snapshot);
                }

                Frame::FinishSwitchInt {
                    discriminant,
                    targets,
                } => {
                    finish_switch_int(&mut results, *discriminant, targets);
                }
            }
        }

        let result = results.pop().expect("no result produced");
        debug_assert!(results.is_empty());

        result
    }
}
