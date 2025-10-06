use core::fmt::Debug;

use hash_graph_store::filter::{Filter, FilterExpression, Parameter, QueryRecord};
use hashql_hir::node::{
    Node,
    kind::NodeKind,
    r#let::{Binding, Let},
    operation::{
        BinaryOperation, Operation, OperationKind, TypeOperation,
        binary::BinOpKind,
        r#type::{TypeAssertion, TypeOperationKind},
    },
    variable::{LocalVariable, Variable, VariableKind},
};

use super::{
    CompilationError, FilterCompilerContext, GraphReadCompiler,
    error::{BranchContext, branch_unsupported, qualified_variable_unsupported},
    path::CompleteQueryPath,
    sink::FilterSink,
};

impl<'env, 'heap: 'env> GraphReadCompiler<'env, 'heap> {
    #[expect(clippy::too_many_lines, reason = "match statement")]
    pub(super) fn compile_filter<R>(
        &mut self,
        context: FilterCompilerContext,
        node: &'heap Node<'heap>,
        sink: &mut FilterSink<'_, 'heap, R>,
    ) -> Result<(), CompilationError>
    where
        R: QueryRecord<QueryPath<'heap>: CompleteQueryPath<'heap, PartialQueryPath: Debug>>,
    {
        match node.kind {
            NodeKind::Variable(Variable {
                span: _,
                kind:
                    VariableKind::Local(LocalVariable {
                        span: _,
                        id,
                        arguments: _,
                    }),
            }) => {
                debug_assert_ne!(
                    id.value, context.param_id,
                    "typecheck should have caught this, cannot just return the entity itself."
                );

                let value = self.locals[&id.value];
                self.compile_filter(context, value, sink)
            }
            NodeKind::Variable(Variable {
                span: _,
                kind: VariableKind::Qualified(qualified),
            }) => {
                self.diagnostics
                    .push(qualified_variable_unsupported(context, qualified));

                Err(CompilationError)
            }
            NodeKind::Let(Let {
                span: _,
                bindings,
                body,
            }) => {
                for Binding { binder, value } in bindings {
                    self.locals.insert(binder.id, value);
                }

                let filter = self.compile_filter(context, body, sink);

                for Binding { binder, value: _ } in bindings {
                    self.locals.remove(&binder.id);
                }

                filter
            }

            NodeKind::Operation(Operation {
                span: _,
                kind:
                    OperationKind::Binary(BinaryOperation {
                        span: _,
                        op,
                        left,
                        right,
                    }),
            }) => {
                let func = match op.kind {
                    BinOpKind::And => {
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
                    BinOpKind::Or => {
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
                    BinOpKind::Eq => Filter::Equal,
                    BinOpKind::Ne => Filter::NotEqual,
                    BinOpKind::Lt => Filter::Less,
                    BinOpKind::Lte => Filter::LessOrEqual,
                    BinOpKind::Gt => Filter::Greater,
                    BinOpKind::Gte => Filter::GreaterOrEqual,
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
            NodeKind::Operation(Operation {
                span: _,
                kind:
                    OperationKind::Type(TypeOperation {
                        span: _,
                        kind:
                            TypeOperationKind::Assertion(TypeAssertion {
                                span: _,
                                value,
                                r#type: _,
                                force: _,
                            }),
                    }),
            }) => self.compile_filter(context, value, sink),
            // If we came to this match arm using these nodes, then that means that the filter
            // must have evaluated to a boolean expression. Therefore we can just check if the
            // expression evaluates to true.
            NodeKind::Operation(Operation {
                span: _,
                kind:
                    OperationKind::Type(TypeOperation {
                        span: _,
                        kind: TypeOperationKind::Constructor(..),
                    }),
            })
            | NodeKind::Input(_)
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
            NodeKind::Branch(branch) => {
                self.diagnostics
                    .push(branch_unsupported(branch, BranchContext::Filter));

                Err(CompilationError)
            }
        }
    }
}
