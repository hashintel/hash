use core::fmt::Debug;

use hash_graph_store::filter::{Filter, FilterExpression, Parameter, QueryRecord};
use hashql_core::value::Primitive;
use hashql_hir::node::{
    Node,
    branch::{Branch, If},
    call::{Call, PointerKind},
    data::Data,
    kind::NodeKind,
    r#let::{Binding, Let},
    operation::{BinOp, BinaryOperation, Operation, TypeAssertion, TypeOperation},
    thunk::Thunk,
    variable::{LocalVariable, Variable},
};

use super::{
    CompilationError, FilterCompilerContext, GraphReadCompiler,
    error::qualified_variable_unsupported, path::CompleteQueryPath, sink::FilterSink,
};

/// Checks if a [`Node`] represents a boolean literal with the specified value.
///
/// This helper function is used to optimize conditional expressions when one
/// branch is a literal boolean value.
///
/// # Examples
///
/// ```ignore
/// // Returns true if the node represents `true`
/// assert!(is_bool_literal(true_node, true));
/// // Returns false if the node represents `false` when checking for `true`
/// assert!(!is_bool_literal(false_node, true));
/// ```
fn is_bool_literal(node: Node<'_>, value: bool) -> bool {
    matches!(
        node.kind,
        NodeKind::Data(Data::Primitive(Primitive::Boolean(constant))) if constant == value
    )
}

impl<'env, 'heap: 'env> GraphReadCompiler<'env, 'heap> {
    #[expect(clippy::too_many_lines, reason = "match statement")]
    pub(super) fn compile_filter<R>(
        &mut self,
        context: FilterCompilerContext,
        node: Node<'heap>,
        sink: &mut FilterSink<'_, 'heap, R>,
    ) -> Result<(), CompilationError>
    where
        R: QueryRecord<QueryPath<'heap>: CompleteQueryPath<'heap, PartialQueryPath: Debug> + Clone>,
    {
        match node.kind {
            NodeKind::Variable(Variable::Local(LocalVariable { id, arguments: _ })) => {
                debug_assert_ne!(
                    id.value, context.param_id,
                    "typecheck should have caught this, cannot just return the entity itself."
                );

                let value = self.locals[&id.value];
                self.compile_filter(context, value, sink)
            }
            NodeKind::Variable(Variable::Qualified(qualified)) => {
                self.diagnostics.push(qualified_variable_unsupported(
                    context, &qualified, node.span,
                ));

                Err(CompilationError)
            }
            NodeKind::Let(Let { bindings, body }) => {
                for Binding {
                    span: _,
                    binder,
                    value,
                } in bindings
                {
                    self.locals.insert(binder.id, *value);
                }

                let filter = self.compile_filter(context, body, sink);

                for Binding {
                    span: _,
                    binder,
                    value: _,
                } in bindings
                {
                    self.locals.remove(&binder.id);
                }

                filter
            }
            NodeKind::Operation(Operation::Binary(BinaryOperation { op, left, right })) => {
                let func = match op.value {
                    BinOp::And => {
                        let mut sink = sink.and();

                        let (left, right) = (
                            self.compile_filter(context, left, &mut sink),
                            self.compile_filter(context, right, &mut sink),
                        );

                        // We defer the error handling to make sure we gather every diagnostic
                        left?;
                        right?;

                        return Ok(());
                    }
                    BinOp::Or => {
                        let mut sink = sink.or();

                        let (left, right) = (
                            self.compile_filter(context, left, &mut sink),
                            self.compile_filter(context, right, &mut sink),
                        );

                        // We defer the error handling to make sure we gather every diagnostic
                        left?;
                        right?;

                        return Ok(());
                    }
                    BinOp::Eq => Filter::Equal,
                    BinOp::Ne => Filter::NotEqual,
                    BinOp::Lt => Filter::Less,
                    BinOp::Lte => Filter::LessOrEqual,
                    BinOp::Gt => Filter::Greater,
                    BinOp::Gte => Filter::GreaterOrEqual,
                };

                let (left, right) = (
                    self.compile_filter_expr(context, left)
                        .and_then(|expr| expr.finish(context, &mut self.diagnostics)),
                    self.compile_filter_expr(context, right)
                        .and_then(|expr| expr.finish(context, &mut self.diagnostics)),
                );

                sink.push(func(left?, right?));
                Ok(())
            }
            // Unary are currently not supported, so we can skip them
            NodeKind::Operation(Operation::Type(TypeOperation::Assertion(TypeAssertion {
                value,
                r#type: _,
                force: _,
            }))) => self.compile_filter(context, value, sink),
            NodeKind::Thunk(Thunk { body }) => self.compile_filter(context, body, sink),
            NodeKind::Call(Call {
                kind: PointerKind::Thin,
                function,
                arguments: _,
            }) => {
                // A thin call is a call to a thunk, so simply redirect to the thunks body
                self.compile_filter(context, function, sink)
            }
            // If we came to this match arm using these nodes, then that means that the filter
            // must have evaluated to a boolean expression. Therefore we can just check if the
            // expression evaluates to true.
            NodeKind::Operation(
                Operation::Type(TypeOperation::Constructor(..)) | Operation::Input(..),
            )
            | NodeKind::Data(_)
            | NodeKind::Access(_)
            | NodeKind::Call(_)
            | NodeKind::Closure(_)
            | NodeKind::Graph(_) => {
                sink.push(Filter::Equal(
                    self.compile_filter_expr(context, node)?
                        .finish(context, &mut self.diagnostics)?,
                    FilterExpression::Parameter {
                        parameter: Parameter::Boolean(true),
                        convert: None,
                    },
                ));

                Ok(())
            }
            // Conditional expressions (`if A then B else C`) are transformed into equivalent
            // boolean logic expressions. We apply optimizations for common literal patterns:
            //
            // 1. `if A then true else C` → `A || C`
            // 2. `if A then B else false` → `A && B`
            // 3. General case: `if A then B else C` → `(A && B) || (!A && C)`
            //
            // The general transformation preserves semantics:
            // - When A is true: `(true && B) || (false && C)` = `B || false` = `B`
            // - When A is false: `(false && B) || (true && C)` = `false || C` = `C`
            NodeKind::Branch(Branch::If(If { test, then, r#else })) => {
                if is_bool_literal(then, true) {
                    // Optimization: `if A then true else C` → `A || C`
                    // When A is true, result is true; when A is false, result is C
                    let mut sink = sink.or();

                    let test = self.compile_filter(context, test, &mut sink);
                    let r#else = self.compile_filter(context, r#else, &mut sink);

                    // Delayed to ensure that we get all diagnostics possible
                    test?;
                    r#else?;
                } else if is_bool_literal(r#else, false) {
                    // Optimization: `if A then B else false` → `A && B`
                    // When A is true, result is B; when A is false, result is false
                    let mut sink = sink.and();

                    let test = self.compile_filter(context, test, &mut sink);
                    let then = self.compile_filter(context, then, &mut sink);

                    // Delayed to ensure that we get all diagnostics possible
                    test?;
                    then?;
                } else {
                    // General case: `if A then B else C` → `(A && B) || (!A && C)`

                    // Compile each branch into separate filter vectors to enable reuse
                    // of the test condition in both the positive and negative forms
                    let mut test_filter = Vec::new();
                    let mut test_sink = FilterSink::<R>::And(&mut test_filter);
                    let test_result = self.compile_filter(context, test, &mut test_sink);

                    let mut then_filter = Vec::new();
                    let mut then_sink = FilterSink::<R>::And(&mut then_filter);
                    let then_result = self.compile_filter(context, then, &mut then_sink);

                    let mut else_filter = Vec::new();
                    let mut else_sink = FilterSink::<R>::And(&mut else_filter);
                    let else_result = self.compile_filter(context, r#else, &mut else_sink);

                    // Build left side: `A && B`
                    let mut left = Vec::with_capacity(test_filter.len() + then_filter.len());
                    left.extend_from_slice(&test_filter);
                    left.extend(then_filter);
                    let left = Filter::All(left);

                    // Build right side: `!A && C`
                    let mut right = Vec::with_capacity(1 + else_filter.len());
                    right.push(Filter::Not(Box::new(Filter::All(test_filter))));
                    right.extend(else_filter);
                    let right = Filter::All(right);

                    // Combine with OR: `(A && B) || (!A && C)`
                    let mut sink = sink.or();
                    sink.push(left);
                    sink.push(right);

                    // Defer error handling to collect all diagnostics before failing
                    test_result?;
                    then_result?;
                    else_result?;
                }

                Ok(())
            }
        }
    }
}
